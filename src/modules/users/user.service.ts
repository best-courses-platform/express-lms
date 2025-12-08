// domains/users/user.service.ts
import { NewUser, UpdateUser, User } from './user.types';
import { userRepository } from './user.repository';
import { AppError } from '../../utils/errors';
import { USER_MESSAGES } from './user.constants';
import { OAuthProfile } from 'auth/auth.types';

class UserService {
  async create(userData: NewUser): Promise<User> {
    const normalizedEmail = userData.email.toLowerCase().trim();
    const exists = await userRepository.findByEmail(normalizedEmail);

    if (exists) {
      throw new AppError(409, USER_MESSAGES.ERROR.ALREADY_EXISTS);
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

      let user = await userRepository.findByGoogleId(profile.id);

      if (!user) {
        const existingUser = await userRepository.findByEmail(profile.emails[0].value);

        if (existingUser) {
          user = await userRepository.update(existingUser._id.toString(), {
            googleId: profile.id,
            avatar: profile.photos?.[0]?.value || existingUser.avatar,
          });
        } else {
          user = await userRepository.create({
            name: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id,
            avatar: profile.photos?.[0]?.value,
            role: 'student',
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
}

export const userService = new UserService();
