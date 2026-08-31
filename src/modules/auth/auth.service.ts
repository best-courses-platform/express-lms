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
import { isPlainUser, isUserDocumentStrict } from '../../utils/typeGuards';
import { userRepository } from 'users/user.repository';
import { emailService } from 'email/email.service';
import { enqueuePasswordResetEmail, enqueueVerificationEmail } from 'email/email.queue';
import crypto from 'crypto'; // Импортируем crypto

export class AuthService {
  async register(userData: { name: string; email: string; password: string }): Promise<{ user: User }> {
    try {
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

    // Осознанно НЕ через userRepository.update*() — хеширование пароля происходит
    // в userSchema.pre('save', ...) (user.model.ts), а не при findByIdAndUpdate,
    // который используют методы репозитория. Замена на update() тут молча уронит
    // пароль в БД открытым текстом. save() здесь — единственный корректный вариант.
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    await user.save();
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

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
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

    // save(), не userRepository.update() — та же причина, что в resetPassword() выше:
    // хеширование пароля живёт в pre('save'), findByIdAndUpdate его не вызывает.
    user.password = newPassword;
    await user.save();
  }

  // Оставляем один метод login с проверкой подтверждения email
  async login(email: string, password: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    try {
      const user = await this.authenticate(email, password);

      // Проверяем, подтвержден ли email
      if (!user.isEmailVerified) {
        throw new ForbiddenError(AUTH_MESSAGES.ERROR.EMAIL_NOT_VERIFIED);
      }

      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      return { user, accessToken, refreshToken };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new InternalError(AUTH_MESSAGES.ERROR.AUTH_FAILED, error);
    }
  }

  async refreshTokens(refreshToken: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    try {
      const payload = jwtService.verifyRefreshToken(refreshToken);
      const user = await userService.getById(payload.sub);

      if (!user) {
        throw new UnauthorizedError(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
      }

      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user);

      return { user, accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new UnauthorizedError(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN, error);
    }
  }

  generateAccessToken(user: User): string {
    return jwtService.generateAccessToken(user);
  }

  generateRefreshToken(user: User): string {
    return jwtService.generateRefreshToken(user);
  }

  isValidUser(user: unknown): user is User {
    return isPlainUser(user);
  }
}

export const authService = new AuthService();
