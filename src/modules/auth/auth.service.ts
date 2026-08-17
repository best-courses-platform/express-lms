import { userService } from 'users/user.service';
import { NewUser, User } from 'users/user.types';
import { jwtService } from 'jwt/jwt.service';
import { AppError } from '../../utils/errors';
import { AUTH_MESSAGES } from './auth.constants';
import { isPlainUser, isUserDocumentStrict, isUserWithPassword, toSafeUser } from '../../utils/typeGuards';
import { userRepository } from 'users/user.repository';
import { emailService } from 'email/email.service';
import crypto from 'crypto'; // Импортируем crypto

export class AuthService {
  async register(userData: {
    name: string;
    email: string;
    password: string;
    role: string;
  }): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    try {
      // userService.create сам решает isEmailVerified/токен (false + токен для локальной регистрации, true для OAuth)
      const user = await userService.create(userData as NewUser);

      // Отправляем email для подтверждения
      if (emailService.isConfigured() && user.emailVerificationToken) {
        await emailService.sendVerificationEmail(user.email, user.emailVerificationToken, user.name);
      }

      // Генерируем токены (доступ ограничен до подтверждения email)
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      return { user, accessToken, refreshToken };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(500, AUTH_MESSAGES.ERROR.AUTH_FAILED, error);
    }
  }

  async verifyEmail(token: string): Promise<User> {
    const user = await userRepository.findByEmailVerificationToken(token);

    if (!user) {
      throw new AppError(400, AUTH_MESSAGES.ERROR.INVALID_VERIFICATION_TOKEN);
    }

    // Проверяем срок действия токена
    if (user.emailVerificationExpires && user.emailVerificationExpires < new Date()) {
      throw new AppError(400, AUTH_MESSAGES.ERROR.VERIFICATION_TOKEN_EXPIRED);
    }

    // Подтверждаем email (user уже UserDocument — findByEmailVerificationToken так типизирован)
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;

    return await user.save();
  }

  async resendVerificationEmail(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);

    // Единообразный тихий ответ и для "email не найден", и для "уже подтверждён" —
    // иначе разница в ответе (400 EMAIL_ALREADY_VERIFIED vs тихий успех) палит user enumeration.
    if (!user || user.isEmailVerified) {
      return;
    }

    // Генерируем новый токен
    user.emailVerificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await user.save();

    // Отправляем email
    if (emailService.isConfigured()) {
      await emailService.sendVerificationEmail(user.email, user.emailVerificationToken, user.name);
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      // Для безопасности не сообщаем, найден пользователь или нет
      return;
    }

    // Генерируем токен для сброса пароля
    user.passwordResetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 час

    await user.save();

    // Отправляем email
    if (emailService.isConfigured()) {
      await emailService.sendPasswordResetEmail(user.email, user.passwordResetToken, user.name);
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await userRepository.findByPasswordResetToken(token);

    if (!user) {
      throw new AppError(400, AUTH_MESSAGES.ERROR.INVALID_RESET_TOKEN);
    }

    // Проверяем срок действия токена
    if (user.passwordResetExpires && user.passwordResetExpires < new Date()) {
      throw new AppError(400, AUTH_MESSAGES.ERROR.RESET_TOKEN_EXPIRED);
    }

    // Обновляем пароль
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    await user.save();
  }

  async authenticate(email: string, password: string): Promise<User> {
    const user = await userRepository.findByEmailWithPassword(email);

    if (!user) {
      throw new AppError(401, AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    if (!isUserDocumentStrict(user)) {
      throw new AppError(500, AUTH_MESSAGES.ERROR.AUTHENTICATION_ERROR);
    }

    const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword) {
      throw new AppError(401, AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    const userPlainObject = user.toObject<User & { password: string }>();

    if (!isUserWithPassword(userPlainObject)) {
      throw new AppError(500, AUTH_MESSAGES.ERROR.AUTH_FAILED);
    }

    const { password: _, ...userWithoutPassword } = userPlainObject;
    return toSafeUser(userWithoutPassword);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await userRepository.findByEmailWithPassword(userId);

    if (!user) {
      throw new AppError(404, AUTH_MESSAGES.ERROR.AUTH_FAILED);
    }

    if (!isUserDocumentStrict(user)) {
      throw new AppError(500, AUTH_MESSAGES.ERROR.AUTHENTICATION_ERROR);
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      throw new AppError(400, AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    const userWithMethods = user as User & { save: () => Promise<void> };
    userWithMethods.password = newPassword;
    await userWithMethods.save();
  }

  // Оставляем один метод login с проверкой подтверждения email
  async login(email: string, password: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    try {
      const user = await this.authenticate(email, password);

      // Проверяем, подтвержден ли email
      if (!user.isEmailVerified) {
        throw new AppError(403, AUTH_MESSAGES.ERROR.EMAIL_NOT_VERIFIED);
      }

      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      return { user, accessToken, refreshToken };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(500, AUTH_MESSAGES.ERROR.AUTH_FAILED, error);
    }
  }

  async refreshTokens(refreshToken: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    try {
      const payload = jwtService.verifyRefreshToken(refreshToken);
      const user = await userService.getById(payload.sub);

      if (!user) {
        throw new AppError(401, AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
      }

      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user);

      return { user, accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(401, AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN, error);
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
