import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Types } from 'mongoose';
import type { userRepository as UserRepositoryInstance } from '../user.repository';
import type { userService as UserServiceInstance } from '../user.service';
import type { User, UserDocument } from '../user.types';
import type { OAuthProfile } from 'auth/auth.types';

// Unit-слой: userRepository замокан — проверяем только бизнес-логику userService (нормализация
// email, ветвление OAuth/локальной регистрации, привязка провайдера к существующему аккаунту).
// Интеграционные тесты (user.routes.integration.spec.ts) добивают HTTP-контракт, роли/права
// доступа и реальный Mongoose поверх mongodb-memory-server.
//
// @swc/jest не хойстит jest.mock() выше import — require() после jest.mock() обязателен
// для всего мокаемого/транзитивно ссылающегося на мокаемое (см. Obsidian: Jest/4).
jest.mock('../user.repository', () => ({
  userRepository: {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findByGoogleId: jest.fn(),
    findByGithubId: jest.fn(),
    update: jest.fn(),
    updateWithSensitiveFields: jest.fn(),
    isEmailTaken: jest.fn(),
    delete: jest.fn(),
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { userRepository } = require('../user.repository') as { userRepository: typeof UserRepositoryInstance };
const { userService } = require('../user.service') as { userService: typeof UserServiceInstance };
/* eslint-enable @typescript-eslint/no-var-requires */

const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;

// userRepository методы типизированы как возвращающие UserDocument (полноценный Mongoose-
// документ), а не plain User — в отличие от courseRepository/lessonRepository, которые
// работают с plain-типами. Здесь unit-тесты не трогают методы документа (save(),
// comparePassword() и т.п.), поэтому plain-объект, приведённый к UserDocument, достаточен —
// как минимум для этого сервиса ни один из проверяемых путей их не вызывает.
function createMockUser(overrides: Partial<User> = {}): UserDocument {
  return {
    _id: new Types.ObjectId(),
    name: 'Test User',
    email: 'test@example.com',
    role: 'student',
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as UserDocument;
}

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    describe('Когда email уже занят', () => {
      it('должен выбросить 409, не создавая пользователя', async () => {
        // Given
        mockUserRepository.findByEmail.mockResolvedValue(createMockUser({ email: 'taken@example.com' }));

        // When & Then
        await expect(
          userService.create({
            name: 'New',
            email: 'taken@example.com',
            password: 'password123',
            role: 'student',
            isEmailVerified: false,
          })
        ).rejects.toMatchObject({ status: 409 });
        expect(mockUserRepository.create).not.toHaveBeenCalled();
      });
    });

    describe('Когда email свободен, регистрация локальная (без googleId/githubId)', () => {
      it('должен сгенерировать токен подтверждения и НЕ проставлять isEmailVerified', async () => {
        // Given
        mockUserRepository.findByEmail.mockResolvedValue(null);
        mockUserRepository.create.mockResolvedValue(createMockUser());

        // When
        await userService.create({
          name: 'New',
          email: 'New@Example.com ',
          password: 'password123',
          role: 'student',
          isEmailVerified: false,
        });

        // Then
        const [passedData] = mockUserRepository.create.mock.calls[0];
        expect(passedData.emailVerificationToken).toEqual(expect.any(String));
        expect(passedData.emailVerificationExpires).toBeInstanceOf(Date);
        expect(passedData.isEmailVerified).toBe(false);
      });

      it('должен нормализовать email (lowercase + trim) при поиске дубликата', async () => {
        // Given
        mockUserRepository.findByEmail.mockResolvedValue(null);
        mockUserRepository.create.mockResolvedValue(createMockUser());

        // When
        await userService.create({
          name: 'New',
          email: '  New@Example.com  ',
          password: 'password123',
          role: 'student',
          isEmailVerified: false,
        });

        // Then
        expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('new@example.com');
      });
    });

    describe('Когда пользователь создаётся через OAuth (передан googleId)', () => {
      it('должен проставить isEmailVerified: true и не генерировать токен подтверждения', async () => {
        // Given
        mockUserRepository.findByEmail.mockResolvedValue(null);
        mockUserRepository.create.mockResolvedValue(createMockUser());

        // When
        await userService.create({
          name: 'OAuth User',
          email: 'oauth@example.com',
          googleId: 'google-123',
          role: 'student',
          isEmailVerified: false,
        });

        // Then
        const [passedData] = mockUserRepository.create.mock.calls[0];
        expect(passedData.isEmailVerified).toBe(true);
        expect(passedData.emailVerificationToken).toBeUndefined();
      });
    });
  });

  describe('list', () => {
    it('должен вернуть всех пользователей из репозитория как есть', async () => {
      // Given
      const users = [createMockUser(), createMockUser()];
      mockUserRepository.findAll.mockResolvedValue(users);

      // When
      const result = await userService.list();

      // Then
      expect(result).toBe(users);
    });
  });

  describe('getById', () => {
    describe('Когда пользователь не найден', () => {
      it('должен выбросить 404', async () => {
        mockUserRepository.findById.mockResolvedValue(null);

        await expect(userService.getById('507f1f77bcf86cd799439011')).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('Когда пользователь найден', () => {
      it('должен вернуть пользователя как есть', async () => {
        const user = createMockUser();
        mockUserRepository.findById.mockResolvedValue(user);

        const result = await userService.getById(user._id.toString());

        expect(result).toBe(user);
      });
    });
  });

  describe('update', () => {
    describe('Когда пользователь не найден', () => {
      it('должен выбросить 404, не проверяя занятость email', async () => {
        mockUserRepository.findById.mockResolvedValue(null);

        await expect(userService.update('507f1f77bcf86cd799439011', { name: 'X' })).rejects.toMatchObject({
          status: 404,
        });
        expect(mockUserRepository.isEmailTaken).not.toHaveBeenCalled();
      });
    });

    describe('Когда email не меняется', () => {
      it('не должен проверять занятость email вообще', async () => {
        // Given
        const user = createMockUser({ email: 'same@example.com' });
        mockUserRepository.findById.mockResolvedValue(user);
        mockUserRepository.update.mockResolvedValue(user);

        // When
        await userService.update(user._id.toString(), { name: 'New Name' });

        // Then
        expect(mockUserRepository.isEmailTaken).not.toHaveBeenCalled();
        expect(mockUserRepository.update).toHaveBeenCalledWith(user._id.toString(), { name: 'New Name' });
      });
    });

    describe('Когда email меняется на уже занятый другим пользователем', () => {
      it('должен выбросить 409, не обновляя пользователя', async () => {
        // Given
        const user = createMockUser({ email: 'old@example.com' });
        mockUserRepository.findById.mockResolvedValue(user);
        mockUserRepository.isEmailTaken.mockResolvedValue(true);

        // When & Then
        await expect(
          userService.update(user._id.toString(), { email: 'taken@example.com' })
        ).rejects.toMatchObject({ status: 409 });
        expect(mockUserRepository.update).not.toHaveBeenCalled();
      });

      it('должен исключить самого пользователя из проверки занятости (передать excludeUserId)', async () => {
        // Given
        const user = createMockUser({ email: 'old@example.com' });
        mockUserRepository.findById.mockResolvedValue(user);
        mockUserRepository.isEmailTaken.mockResolvedValue(false);
        mockUserRepository.update.mockResolvedValue(user);

        // When
        await userService.update(user._id.toString(), { email: 'new@example.com' });

        // Then
        expect(mockUserRepository.isEmailTaken).toHaveBeenCalledWith('new@example.com', user._id.toString());
      });
    });

    describe('Когда email меняется на свободный', () => {
      it('должен сбросить isEmailVerified и сгенерировать новый токен подтверждения', async () => {
        // Given
        const user = createMockUser({ email: 'old@example.com' });
        mockUserRepository.findById.mockResolvedValue(user);
        mockUserRepository.isEmailTaken.mockResolvedValue(false);
        mockUserRepository.update.mockResolvedValue(user);

        // When
        await userService.update(user._id.toString(), { email: 'new@example.com' });

        // Then
        const [, passedPatch] = mockUserRepository.update.mock.calls[0];
        expect(passedPatch.isEmailVerified).toBe(false);
        expect(passedPatch.emailVerificationToken).toEqual(expect.any(String));
        expect(passedPatch.emailVerificationExpires).toBeInstanceOf(Date);
      });
    });
  });

  describe('delete', () => {
    describe('Когда пользователь не найден (repository.delete вернул false)', () => {
      it('должен выбросить 404', async () => {
        mockUserRepository.delete.mockResolvedValue(false);

        await expect(userService.delete('507f1f77bcf86cd799439011')).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('Когда пользователь удалён успешно', () => {
      it('не должен выбрасывать ошибку', async () => {
        mockUserRepository.delete.mockResolvedValue(true);

        await expect(userService.delete('507f1f77bcf86cd799439011')).resolves.toBeUndefined();
      });
    });
  });

  describe('findOrCreateFromOAuth', () => {
    function createProfile(overrides: Partial<OAuthProfile> = {}): OAuthProfile {
      return {
        id: 'provider-id-123',
        provider: 'google',
        displayName: 'OAuth Name',
        emails: [{ value: 'oauth@example.com' }],
        ...overrides,
      };
    }

    describe('Когда в профиле нет email', () => {
      it('должен выбросить 400', async () => {
        const profile = createProfile({ emails: [] });

        await expect(userService.findOrCreateFromOAuth(profile)).rejects.toMatchObject({ status: 400 });
      });
    });

    describe('Когда пользователь уже найден по googleId', () => {
      it('не должен создавать нового пользователя и не должен трогать updateWithSensitiveFields, если email уже подтверждён', async () => {
        // Given
        const existing = createMockUser({ isEmailVerified: true });
        mockUserRepository.findByGoogleId.mockResolvedValue(existing);

        // When
        const result = await userService.findOrCreateFromOAuth(createProfile());

        // Then
        expect(result).toBe(existing);
        expect(mockUserRepository.create).not.toHaveBeenCalled();
        expect(mockUserRepository.updateWithSensitiveFields).not.toHaveBeenCalled();
      });
    });

    describe('Когда пользователь найден по githubId', () => {
      it('должен искать именно по findByGithubId, а не по findByGoogleId', async () => {
        // Given
        const existing = createMockUser({ isEmailVerified: true });
        mockUserRepository.findByGithubId.mockResolvedValue(existing);

        // When
        await userService.findOrCreateFromOAuth(createProfile({ provider: 'github' }));

        // Then
        expect(mockUserRepository.findByGithubId).toHaveBeenCalledWith('provider-id-123');
        expect(mockUserRepository.findByGoogleId).not.toHaveBeenCalled();
      });
    });

    describe('Когда провайдер не находит пользователя по id, но есть аккаунт с таким email', () => {
      it('должен привязать providerId к существующему аккаунту через updateWithSensitiveFields', async () => {
        // Given
        const existing = createMockUser({ email: 'oauth@example.com', isEmailVerified: true, avatar: 'old-avatar.png' });
        mockUserRepository.findByGoogleId.mockResolvedValue(null);
        mockUserRepository.findByEmail.mockResolvedValue(existing);
        mockUserRepository.updateWithSensitiveFields.mockResolvedValue(
          createMockUser({ ...existing, googleId: 'provider-id-123' })
        );

        // When
        await userService.findOrCreateFromOAuth(createProfile());

        // Then
        expect(mockUserRepository.updateWithSensitiveFields).toHaveBeenCalledWith(
          existing._id.toString(),
          expect.objectContaining({ googleId: 'provider-id-123' })
        );
        expect(mockUserRepository.create).not.toHaveBeenCalled();
      });

      it('должен использовать avatar из профиля, если он есть, иначе оставить существующий', async () => {
        // Given
        const existing = createMockUser({ email: 'oauth@example.com', isEmailVerified: true, avatar: 'old-avatar.png' });
        mockUserRepository.findByGoogleId.mockResolvedValue(null);
        mockUserRepository.findByEmail.mockResolvedValue(existing);
        mockUserRepository.updateWithSensitiveFields.mockResolvedValue(existing);

        // When — профиль без photos
        await userService.findOrCreateFromOAuth(createProfile());

        // Then
        expect(mockUserRepository.updateWithSensitiveFields).toHaveBeenCalledWith(
          existing._id.toString(),
          expect.objectContaining({ avatar: 'old-avatar.png' })
        );
      });
    });

    describe('Когда пользователь не найден ни по id, ни по email', () => {
      it('должен создать нового пользователя с ролью student и isEmailVerified: true', async () => {
        // Given
        mockUserRepository.findByGoogleId.mockResolvedValue(null);
        mockUserRepository.findByEmail.mockResolvedValue(null);
        mockUserRepository.create.mockResolvedValue(createMockUser({ isEmailVerified: true }));

        // When
        await userService.findOrCreateFromOAuth(createProfile());

        // Then
        expect(mockUserRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'oauth@example.com',
            googleId: 'provider-id-123',
            role: 'student',
            isEmailVerified: true,
          })
        );
      });

      describe('Когда провайдер — github и нет displayName', () => {
        it('должен использовать username как имя', async () => {
          // Given
          mockUserRepository.findByGithubId.mockResolvedValue(null);
          mockUserRepository.findByEmail.mockResolvedValue(null);
          mockUserRepository.create.mockResolvedValue(createMockUser());

          // When
          await userService.findOrCreateFromOAuth(
            createProfile({ provider: 'github', displayName: undefined, username: 'octocat' })
          );

          // Then
          expect(mockUserRepository.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'octocat' }));
        });
      });

      describe('Когда нет ни displayName, ни username', () => {
        it('должен использовать "User" как fallback-имя', async () => {
          // Given
          mockUserRepository.findByGoogleId.mockResolvedValue(null);
          mockUserRepository.findByEmail.mockResolvedValue(null);
          mockUserRepository.create.mockResolvedValue(createMockUser());

          // When
          await userService.findOrCreateFromOAuth(createProfile({ displayName: undefined }));

          // Then
          expect(mockUserRepository.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'User' }));
        });
      });
    });

    describe('Когда найденный пользователь (по id) имеет isEmailVerified: false', () => {
      it('должен принудительно подтвердить email на каждом OAuth-входе, а не только при создании', async () => {
        // Given — регрессия: старые записи (созданные до появления этой логики, либо
        // поправленные вручную в БД) не должны навсегда виснуть с EMAIL_NOT_VERIFIED —
        // у OAuth-аккаунта нет письма с подтверждением, которое можно переотправить.
        const existing = createMockUser({ isEmailVerified: false });
        mockUserRepository.findByGoogleId.mockResolvedValue(existing);
        mockUserRepository.updateWithSensitiveFields.mockResolvedValue(
          createMockUser({ ...existing, isEmailVerified: true })
        );

        // When
        const result = await userService.findOrCreateFromOAuth(createProfile());

        // Then
        expect(mockUserRepository.updateWithSensitiveFields).toHaveBeenCalledWith(existing._id.toString(), {
          isEmailVerified: true,
        });
        expect(result.isEmailVerified).toBe(true);
      });
    });

    describe('Когда репозиторий бросает непредвиденную ошибку', () => {
      it('должен обернуть её в AppError(500), а не пробросить как есть', async () => {
        // Given
        mockUserRepository.findByGoogleId.mockRejectedValue(new Error('Mongo недоступен'));

        // When & Then
        await expect(userService.findOrCreateFromOAuth(createProfile())).rejects.toMatchObject({ status: 500 });
      });
    });

    describe('Когда репозиторий бросает AppError', () => {
      it('должен пробросить исходную AppError как есть, не подменяя на 500', async () => {
        // Given
        const { AppError } = require('../../../utils/errors');
        mockUserRepository.findByGoogleId.mockRejectedValue(new AppError(409, 'conflict'));

        // When & Then
        await expect(userService.findOrCreateFromOAuth(createProfile())).rejects.toMatchObject({ status: 409 });
      });
    });
  });
});
