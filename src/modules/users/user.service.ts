import { NewUser, UpdateUser, User } from './user.types';
import { userRepository } from './user.repository';
import { AppError } from '../../utils/errors';
import { USER_MESSAGES } from './user.constants';
import { OAuthProfile } from 'auth/auth.types';
import crypto from 'crypto';

class UserService {
  async create(userData: NewUser): Promise<User> {
    const normalizedEmail = userData.email.toLowerCase().trim();
    const exists = await userRepository.findByEmail(normalizedEmail);

    if (exists) {
      throw new AppError(409, USER_MESSAGES.ERROR.ALREADY_EXISTS);
    }

    // Если пользователь создается через OAuth, email считается подтвержденным
    if (userData.googleId || userData.githubId) {
      userData.isEmailVerified = true;
    } else {
      // Для локальной регистрации генерируем токен подтверждения
      userData.emailVerificationToken = crypto.randomBytes(32).toString('hex');
      userData.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    return userRepository.create(userData);
  }

  async list(): Promise<User[]> {
    return userRepository.findAll();
  }

  async getById(id: string): Promise<User> {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new AppError(404, USER_MESSAGES.ERROR.NOT_FOUND);
    }

    return user;
  }

  async update(id: string, patch: UpdateUser): Promise<User> {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new AppError(404, USER_MESSAGES.ERROR.NOT_FOUND);
    }

    if (patch.email && patch.email !== user.email) {
      const isTaken = await userRepository.isEmailTaken(patch.email, id);

      if (isTaken) {
        throw new AppError(409, USER_MESSAGES.ERROR.ALREADY_EXISTS);
      }

      // При смене email сбрасываем подтверждение
      patch.isEmailVerified = false;
      patch.emailVerificationToken = crypto.randomBytes(32).toString('hex');
      patch.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    return userRepository.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    const ok = await userRepository.delete(id);

    if (!ok) {
      throw new AppError(404, USER_MESSAGES.ERROR.NOT_FOUND);
    }
  }

  async findOrCreateFromOAuth(profile: OAuthProfile): Promise<User> {
    try {
      if (!profile.emails?.[0]?.value) {
        throw new AppError(400, USER_MESSAGES.ERROR.USER_DATA_PROCESSING_ERROR);
      }

      const isGithub = profile.provider === 'github';
      const providerField = isGithub ? 'githubId' : 'googleId';

      // Ищем пользователя
      let user = isGithub
        ? await userRepository.findByGithubId(profile.id)
        : await userRepository.findByGoogleId(profile.id);

      if (!user) {
        const existingUser = await userRepository.findByEmail(profile.emails[0].value);

        if (existingUser) {
          user = await userRepository.updateWithSensitiveFields(existingUser._id.toString(), {
            [providerField]: profile.id,
            avatar: profile.photos?.[0]?.value || existingUser.avatar,
          });
        } else {
          // Для GitHub используем username если нет displayName
          const name = profile.displayName || (isGithub ? profile.username : null) || 'User';

          user = await userRepository.create({
            name,
            email: profile.emails[0].value,
            [providerField]: profile.id,
            avatar: profile.photos?.[0]?.value,
            role: 'student',
            isEmailVerified: true, // OAuth email считается подтвержденным
          } as NewUser);
        }
      }

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(500, USER_MESSAGES.ERROR.USER_DATA_PROCESSING_ERROR, error);
    }
  }

  // Новые методы для работы с подтверждением email
  async verifyEmail(token: string): Promise<User> {
    const user = await userRepository.verifyEmail(token);

    if (!user) {
      throw new AppError(400, USER_MESSAGES.ERROR.INVALID_VERIFICATION_TOKEN);
    }

    return user;
  }

  async resendVerificationEmail(email: string): Promise<void> {
    const user = await userRepository.findByEmailWithPassword(email);

    if (!user) {
      // Для безопасности не сообщаем, что пользователь не найден
      return;
    }

    if (user.isEmailVerified) {
      throw new AppError(400, USER_MESSAGES.ERROR.EMAIL_ALREADY_VERIFIED);
    }

    // Генерируем новый токен
    user.emailVerificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await user.save();
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await userRepository.findByEmailWithPassword(email);

    if (!user) {
      // Для безопасности не сообщаем, найден пользователь или нет
      return;
    }

    // Генерируем токен для сброса пароля
    user.passwordResetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);

    await user.save();
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await userRepository.resetPassword(token, newPassword);

    if (!user) {
      throw new AppError(400, USER_MESSAGES.ERROR.INVALID_RESET_TOKEN);
    }
  }

  // Метод для проверки, может ли пользователь выполнять действия
  async checkUserCanPerformAction(userId: string): Promise<boolean> {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new AppError(404, USER_MESSAGES.ERROR.NOT_FOUND);
    }

    return user.isEmailVerified || user.role === 'admin';
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return userRepository.findByEmail(email);
  }

  async getUserByEmailWithPassword(email: string): Promise<User | null> {
    return userRepository.findByEmailWithPassword(email);
  }
}

export const userService = new UserService();
