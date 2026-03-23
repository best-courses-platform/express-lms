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
  }): Promise<{ user: User; accessToken: string; refreshToken: string; verificationToken: string }> {
    try {
      // Создаем пользователя с неподтвержденным email
      const user = await userService.create({
        ...userData,
        isEmailVerified: false,
        emailVerificationToken: crypto.randomBytes(32).toString('hex'),
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 часа
      } as NewUser);

      // Отправляем email для подтверждения
      if (emailService.isConfigured() && user.emailVerificationToken) {
        await emailService.sendVerificationEmail(user.email, user.emailVerificationToken, user.name);
      }

      // Генерируем токены (доступ ограничен до подтверждения email)
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      return {
        user,
        accessToken,
        refreshToken,
        verificationToken: user.emailVerificationToken!,
      };
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

    // Подтверждаем email
    const userWithMethods = user as User & { save: () => Promise<void> }; // Приведение типа
    userWithMethods.isEmailVerified = true;
    userWithMethods.emailVerificationToken = undefined;
    userWithMethods.emailVerificationExpires = undefined;

    await userWithMethods.save();

    // Возвращаем обновленного пользователя без методов
    const { save: _, ...userWithoutMethods } = userWithMethods;
    return userWithoutMethods as User;
  }

  async resendVerificationEmail(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      // Не сообщаем, что пользователь не найден (security)
      return;
    }

    if (user.isEmailVerified) {
      throw new AppError(400, AUTH_MESSAGES.ERROR.EMAIL_ALREADY_VERIFIED);
    }

    // Генерируем новый токен
    const userWithMethods = user as User & { save: () => Promise<void> };
    userWithMethods.emailVerificationToken = crypto.randomBytes(32).toString('hex');
    userWithMethods.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await userWithMethods.save();

    // Отправляем email
    if (emailService.isConfigured() && userWithMethods.emailVerificationToken) {
      await emailService.sendVerificationEmail(
        userWithMethods.email,
        userWithMethods.emailVerificationToken,
        userWithMethods.name
      );
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      // Для безопасности не сообщаем, найден пользователь или нет
      return;
    }

    // Генерируем токен для сброса пароля
    const userWithMethods = user as User & { save: () => Promise<void> };
    userWithMethods.passwordResetToken = crypto.randomBytes(32).toString('hex');
    userWithMethods.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 час

    await userWithMethods.save();

    // Отправляем email
    if (emailService.isConfigured() && userWithMethods.passwordResetToken) {
      await emailService.sendPasswordResetEmail(
        userWithMethods.email,
        userWithMethods.passwordResetToken,
        userWithMethods.name
      );
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
    const userWithMethods = user as User & { save: () => Promise<void> };
    userWithMethods.password = newPassword;
    userWithMethods.passwordResetToken = undefined;
    userWithMethods.passwordResetExpires = undefined;

    await userWithMethods.save();
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
