import { userService } from 'users/user.service';
import { NewUser, User } from 'users/user.types';
import { jwtService } from 'jwt/jwt.service';
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
} from '../../utils/errors';
import { AUTH_MESSAGES } from './auth.constants';
import { isPasswordBreached } from './breached-password-checker';
import { isPlainUser, isUserDocumentStrict } from '../../utils/typeGuards';
import { userRepository } from 'users/user.repository';
import { emailService } from 'email/email.service';
import { enqueuePasswordResetEmail, enqueueVerificationEmail } from 'email/email.queue';
import crypto from 'crypto'; // Импортируем crypto
import { refreshSessionService } from 'sessions/refresh-session.service';
import { SessionContext } from 'sessions/refresh-session.types';
import { SESSION_MESSAGES } from 'sessions/refresh-session.constants';

export class AuthService {
  async register(userData: { name: string; email: string; password: string }): Promise<{ user: User }> {
    try {
      // Проверяем ДО создания пользователя — быстрый отказ без единой записи в БД, если
      // пароль уже засветился в известных утечках (см. breached-password-checker.ts).
      if (await isPasswordBreached(userData.password)) {
        throw new BadRequestError(AUTH_MESSAGES.ERROR.PASSWORD_BREACHED);
      }

      // Роль для публичной саморегистрации всегда 'student' — назначается сервером,
      // а не берётся из тела запроса (иначе анонимный клиент мог бы прислать role: 'admin').
      // userService.create сам решает isEmailVerified/токен (false + токен для локальной регистрации, true для OAuth)
      const user = await userService.create({ ...userData, role: 'student' } as NewUser);

      // Кладём в очередь, не ждём SMTP синхронно — регистрация не должна виснуть/падать
      // из-за медленного или недоступного почтового сервера (см. Obsidian: email раньше
      // лежал в критическом пути этого запроса).
      if (emailService.isConfigured() && user.emailVerificationToken) {
        await enqueueVerificationEmail(user.email, user.emailVerificationToken, user.name);
      }

      // Токены здесь намеренно НЕ выдаются: login() блокирует неподтверждённых
      // (403 EMAIL_NOT_VERIFIED) — register() должен вести себя так же, а не выдавать
      // рабочую сессию в обход этой же проверки. Логин — только после подтверждения email.
      return { user };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new InternalError(AUTH_MESSAGES.ERROR.AUTH_FAILED, error);
    }
  }

  async verifyEmail(token: string): Promise<User> {
    const user = await userRepository.findByEmailVerificationToken(token);

    if (!user) {
      throw new BadRequestError(AUTH_MESSAGES.ERROR.INVALID_VERIFICATION_TOKEN);
    }

    // Проверяем срок действия токена
    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      throw new BadRequestError(AUTH_MESSAGES.ERROR.VERIFICATION_TOKEN_EXPIRED);
    }

    // Подтверждаем email через репозиторий, а не user.save() — сервис не должен сам
    // управлять жизненным циклом Document, это дело репозитория (см. Obsidian: DAO/Repository).
    // updateWithSensitiveFields, а не update() — обычный update() вырезает из ответа
    // emailVerificationToken/passwordResetToken через .select(), а он ещё нужен здесь и ниже.
    return await userRepository.updateWithSensitiveFields(user._id.toString(), {
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    });
  }

  async resendVerificationEmail(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);

    // Единообразный тихий ответ и для "email не найден", и для "уже подтверждён" —
    // иначе разница в ответе (400 EMAIL_ALREADY_VERIFIED vs тихий успех) палит user enumeration.
    if (!user || user.isEmailVerified) {
      return;
    }

    // Токен считаем локально, не читаем обратно из репозитория — так его тип string
    // известен сразу, без null-проверок после update().
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await userRepository.updateWithSensitiveFields(user._id.toString(), {
      emailVerificationToken,
      emailVerificationExpires,
    });

    // Кладём в очередь, не ждём SMTP синхронно
    if (emailService.isConfigured()) {
      await enqueueVerificationEmail(user.email, emailVerificationToken, user.name);
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      // Для безопасности не сообщаем, найден пользователь или нет
      return;
    }

    const passwordResetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 час

    await userRepository.updateWithSensitiveFields(user._id.toString(), {
      passwordResetToken,
      passwordResetExpires,
    });

    // Кладём в очередь, не ждём SMTP синхронно
    if (emailService.isConfigured()) {
      await enqueuePasswordResetEmail(user.email, passwordResetToken, user.name);
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await userRepository.findByPasswordResetToken(token);

    if (!user) {
      throw new BadRequestError(AUTH_MESSAGES.ERROR.INVALID_RESET_TOKEN);
    }

    // Проверяем срок действия токена
    if (user.passwordResetExpires && user.passwordResetExpires < new Date()) {
      throw new BadRequestError(AUTH_MESSAGES.ERROR.RESET_TOKEN_EXPIRED);
    }

    if (await isPasswordBreached(newPassword)) {
      throw new BadRequestError(AUTH_MESSAGES.ERROR.PASSWORD_BREACHED);
    }

    // Осознанно НЕ через userRepository.update*() — хеширование пароля происходит
    // в userSchema.pre('save', ...) (user.model.ts), а не при findByIdAndUpdate,
    // который используют методы репозитория. Замена на update() тут молча уронит
    // пароль в БД открытым текстом. save() здесь — единственный корректный вариант.
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    await user.save();

    // Без исключений (в отличие от changePassword ниже) — пользователь восстанавливал
    // пароль как забывший его, не был аутентифицирован ни в одной сессии в этот момент,
    // значит "текущей" сессии, которую стоило бы пощадить, здесь не существует.
    await refreshSessionService.revokeAllForUser(user._id.toString(), 'password-change');
  }

  async authenticate(email: string, password: string): Promise<User> {
    const user = await userRepository.findByEmailWithPassword(email);

    if (!user) {
      throw new UnauthorizedError(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    if (!isUserDocumentStrict(user)) {
      throw new InternalError(AUTH_MESSAGES.ERROR.AUTHENTICATION_ERROR);
    }

    const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword) {
      throw new UnauthorizedError(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    // toJSON() — тот же метод схемы (user.model.ts), что срабатывает при res.json(user):
    // вырезает password, emailVerificationToken/Expires, passwordResetToken/Expires разом.
    // Раньше здесь был ручной toObject() + деструктуризация password — токены
    // верификации/сброса при этом не вырезались и утекали бы в ответ login().
    return user.toJSON() as User;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentRawRefreshToken?: string
  ): Promise<void> {
    const user = await userRepository.findByIdWithPassword(userId);

    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.ERROR.AUTH_FAILED);
    }

    if (!isUserDocumentStrict(user)) {
      throw new InternalError(AUTH_MESSAGES.ERROR.AUTHENTICATION_ERROR);
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      throw new BadRequestError(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    // Проверяем НОВЫЙ пароль на утечки уже после подтверждения владения текущим —
    // не даём постороннему без currentPassword ничего узнать через этот побочный канал.
    if (await isPasswordBreached(newPassword)) {
      throw new BadRequestError(AUTH_MESSAGES.ERROR.PASSWORD_BREACHED);
    }

    // save(), не userRepository.update() — та же причина, что в resetPassword() выше:
    // хеширование пароля живёт в pre('save'), findByIdAndUpdate его не вызывает.
    user.password = newPassword;
    await user.save();

    // В отличие от resetPassword — пользователь аутентифицирован прямо сейчас, текущую
    // сессию (если пришла refresh-cookie) щадим, паттерн GitHub/Google. Bearer-клиент без
    // cookie — currentRawRefreshToken отсутствует, exceptSessionId не выставится, погасит все.
    const exceptSessionId = currentRawRefreshToken
      ? (refreshSessionService.getSessionIdFromToken(currentRawRefreshToken) ?? undefined)
      : undefined;
    await refreshSessionService.revokeAllForUser(userId, 'password-change', { exceptSessionId });
  }

  // Общий выпуск пары токенов — используется и login() ниже, и контроллером напрямую для
  // login-local/OAuth-колбэков (handleLoginSuccess/handleOAuthCallback), которые раньше
  // звали generateAccessToken/generateRefreshToken прямо на authService, в обход этого
  // метода — тот самый "третий путь выдачи сессии", на который уже наступали (см. Obsidian,
  // портфолио/10). Один метод на все точки входа — забыть здесь про refresh-сессию
  // физически негде.
  async issueTokensFor(user: User, ctx: SessionContext): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await refreshSessionService.issue(user._id.toString(), ctx);

    return { accessToken, refreshToken };
  }

  // Оставляем один метод login с проверкой подтверждения email
  async login(
    email: string,
    password: string,
    ctx: SessionContext
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    try {
      const user = await this.authenticate(email, password);

      // Проверяем, подтвержден ли email
      if (!user.isEmailVerified) {
        throw new ForbiddenError(AUTH_MESSAGES.ERROR.EMAIL_NOT_VERIFIED);
      }

      const { accessToken, refreshToken } = await this.issueTokensFor(user, ctx);

      return { user, accessToken, refreshToken };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new InternalError(AUTH_MESSAGES.ERROR.AUTH_FAILED, error);
    }
  }

  async refreshTokens(
    rawRefreshToken: string,
    ctx: SessionContext
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    try {
      const { userId, familyId, refreshToken } = await refreshSessionService.rotate(rawRefreshToken, ctx);
      // userRepository.findById, не userService.getById — тот бросает NotFoundError(404)
      // вместо null, и проверка ниже была бы недостижимым кодом (исключение улетело бы
      // раньше, минуя revokeFamily). Здесь нужен именно null-исход, не готовая 404-ошибка.
      const user = await userRepository.findById(userId);

      if (!user) {
        // Токен ротировался успешно, но пользователя за ним больше нет (удалён между
        // выдачей и обменом) — гасим всю семью, не только что созданного потомка.
        await refreshSessionService.revokeFamily(familyId, 'user-deleted');
        throw new UnauthorizedError(SESSION_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
      }

      const accessToken = this.generateAccessToken(user);

      return { user, accessToken, refreshToken };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new UnauthorizedError(SESSION_MESSAGES.ERROR.INVALID_REFRESH_TOKEN, error);
    }
  }

  // --- logout ---
  // logoutAll/listSessions/revokeSession убраны отсюда при выносе сессий в отдельный модуль
  // (см. Obsidian: Рефакторинг проблем/31, раздел 9.7) — были чистыми pass-through без
  // единой строки логики, контроллер теперь зовёт refreshSessionService напрямую. logout()
  // остаётся здесь — у него есть реальное ветвление (best-effort, только если токен пришёл).
  async logout(userId: string, rawRefreshToken?: string): Promise<void> {
    if (rawRefreshToken) {
      await refreshSessionService.revokeByToken(rawRefreshToken, 'logout', userId);
    }
  }

  generateAccessToken(user: User): string {
    return jwtService.generateAccessToken(user);
  }

  isValidUser(user: unknown): user is User {
    return isPlainUser(user);
  }
}

export const authService = new AuthService();
