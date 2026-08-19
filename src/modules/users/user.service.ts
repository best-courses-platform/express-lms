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

      // Успешный OAuth-коллбэк сам по себе подтверждает владение почтой — провайдер это
      // уже проверил. Гарантируем isEmailVerified: true на КАЖДОМ входе через OAuth, а не
      // только в момент создания (строка выше): иначе аккаунт, у которого это поле почему-то
      // не выставлено (старые записи, созданные до появления этой логики, ручные правки БД),
      // навсегда виснет с 403 EMAIL_NOT_VERIFIED — без единого самостоятельного способа
      // это исправить (для OAuth-аккаунта нет "письма с подтверждением", которое можно
      // переотправить).
      if (!user.isEmailVerified) {
        user = await userRepository.updateWithSensitiveFields(user._id.toString(), { isEmailVerified: true });
      }

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(500, USER_MESSAGES.ERROR.USER_DATA_PROCESSING_ERROR, error);
    }
  }
}

export const userService = new UserService();
