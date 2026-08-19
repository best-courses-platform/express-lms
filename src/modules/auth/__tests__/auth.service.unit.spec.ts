import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { UserModel } from 'users/user.model';
import { AppError } from '../../../utils/errors';
import type { authService as AuthServiceInstance } from '../auth.service';
import type { userService as UserServiceInstance } from 'users/user.service';
import type { userRepository as UserRepositoryInstance } from 'users/user.repository';
import type { emailService as EmailServiceInstance } from 'email/email.service';
import type { User, UserDocument } from 'users/user.types';

// Unit-слой: repository/сервисы-соседи и почта замоканы, jwtService — НЕТ (быстрый,
// чистый, детерминированный при фиксированном секрете — реальное подписание/проверка
// токена даёт больше уверенности почти бесплатно). Живой Mongo здесь не поднимается —
// see auth.routes.integration.spec.ts для сквозного прохода через реальный Express+Mongo.
//
// jest.mock(path) без фабрики (automock) здесь не сработал: userRepository/userService/
// emailService — синглтон-инстансы классов (`export const x = new X()`), а не наборы
// именованных функций, и automock не подменил их прототипные методы на jest.fn().
jest.mock('users/user.service', () => ({
  userService: {
    create: jest.fn(),
    getById: jest.fn(),
  },
}));
jest.mock('users/user.repository', () => ({
  userRepository: {
    findByEmail: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    findByIdWithPassword: jest.fn(),
    findByEmailVerificationToken: jest.fn(),
    findByPasswordResetToken: jest.fn(),
  },
}));
jest.mock('email/email.service', () => ({
  emailService: {
    isConfigured: jest.fn(),
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  },
}));

// @swc/jest, в отличие от babel-jest, НЕ хойстит jest.mock() выше import-ов (нет аналога
// babel-plugin-jest-hoist) — а сами import-ы, по семантике ESM, хойстятся системой модулей
// всегда, независимо от того, что написано раньше в исходнике. Поэтому обычный
// `import { authService } from '../auth.service'` выше jest.mock() всё равно загрузил бы
// настоящий auth.service.ts (и транзитивно настоящий user.repository) ДО регистрации мока.
// require() — обычный вызов функции, не хойстится — выполняется строго в порядке чтения
// файла, поэтому единственный надёжный способ здесь: jest.mock() и следом require(),
// не import, для всего, что мокается или на мокаемое транзитивно ссылается.
/* eslint-disable @typescript-eslint/no-var-requires */
const { authService } = require('../auth.service') as { authService: typeof AuthServiceInstance };
const { userService } = require('users/user.service') as { userService: typeof UserServiceInstance };
const { userRepository } = require('users/user.repository') as {
  userRepository: typeof UserRepositoryInstance;
};
const { emailService } = require('email/email.service') as { emailService: typeof EmailServiceInstance };
/* eslint-enable @typescript-eslint/no-var-requires */

const mockUserService = userService as jest.Mocked<typeof userService>;
const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;
const mockEmailService = emailService as jest.Mocked<typeof emailService>;

// Настоящий Mongoose-документ (через UserModel), не сохранённый в БД — comparePassword,
// toObject(), isNew/$isNew/_doc и т.п. работают взаправду (это ровно то, от чего зависят
// строгие type guards в auth.service.ts — isUserDocumentStrict/hasComparePassword), не
// нужно вручную имитировать структуру Mongoose-документа руками, ошибка в отсутствующем
// поле дала бы либо ложный 500 AUTHENTICATION_ERROR, либо ложное прохождение проверки.
// save() у документа отдельно застабливается там, где сервис его реально вызывает.
async function createUserDocument(
  overrides: Partial<User> & { plainPassword?: string } = {}
): Promise<UserDocument> {
  const { plainPassword = 'password123', ...rest } = overrides;
  // rounds=4 вместо продовых 12 — единственная причина: скорость юнит-тестов,
  // на корректность bcrypt.compare не влияет.
  const hashedPassword = await bcrypt.hash(plainPassword, 4);

  const user = new UserModel({
    name: 'Test User',
    email: 'test@example.com',
    password: hashedPassword,
    role: 'student',
    isEmailVerified: true,
    ...rest,
  }) as UserDocument;

  // timestamps: true в схеме проставляет createdAt/updatedAt в pre('save')-хуке —
  // на несохранённом документе (мы намеренно не бьём в реальную БД в unit-тестах)
  // их ещё нет, а isUserDocumentStrict()/typeGuards в auth.service.ts требуют
  // оба поля как Date. Проставляем вручную, раз .save() здесь не вызывается.
  user.createdAt = new Date();
  user.updatedAt = new Date();

  return user;
}

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    describe('Когда email свободен', () => {
      it('должен создать пользователя с ролью student, не выдавая токены', async () => {
        // Given
        const created = await createUserDocument({ isEmailVerified: false, emailVerificationToken: 'tok123' });
        mockUserService.create.mockResolvedValue(created);
        mockEmailService.isConfigured.mockReturnValue(false);

        // When
        const result = await authService.register({
          name: 'New User',
          email: 'new@example.com',
          password: 'password123',
        });

        // Then
        expect(mockUserService.create).toHaveBeenCalledWith(
          expect.objectContaining({ role: 'student', email: 'new@example.com' })
        );
        expect(result.user).toBe(created);
        expect(result).not.toHaveProperty('accessToken');
        expect(result).not.toHaveProperty('refreshToken');
      });

      it('роль из тела запроса игнорируется — всегда student, даже если прислали admin', async () => {
        // Given
        const created = await createUserDocument();
        mockUserService.create.mockResolvedValue(created);
        mockEmailService.isConfigured.mockReturnValue(false);

        // When
        await authService.register({
          name: 'Hacker',
          email: 'hacker@example.com',
          password: 'password123',
          // @ts-expect-error — role не часть публичного контракта register(), но проверяем,
          // что даже если протащить его мимо типов (как реальный клиент мог бы через JSON),
          // сервис не передаст его дальше как есть.
          role: 'admin',
        });

        // Then
        expect(mockUserService.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'student' }));
      });
    });

    describe('Когда почта настроена и есть токен подтверждения', () => {
      it('должен отправить письмо подтверждения', async () => {
        // Given
        const created = await createUserDocument({ isEmailVerified: false, emailVerificationToken: 'tok123' });
        mockUserService.create.mockResolvedValue(created);
        mockEmailService.isConfigured.mockReturnValue(true);

        // When
        await authService.register({ name: 'New User', email: 'new@example.com', password: 'password123' });

        // Then
        expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith('test@example.com', 'tok123', 'Test User');
      });
    });

    describe('Когда email уже зарегистрирован', () => {
      it('должен пробросить исходную AppError(409), не подменяя её на 500', async () => {
        // Given
        mockUserService.create.mockRejectedValue(new AppError(409, 'Пользователь с таким email уже существует'));

        // When & Then
        await expect(
          authService.register({ name: 'Dup', email: 'dup@example.com', password: 'password123' })
        ).rejects.toMatchObject({ status: 409 });
      });
    });
  });

  describe('authenticate', () => {
    describe('Когда пользователь с таким email не найден', () => {
      it('должен выбросить 401 INVALID_CREDENTIALS', async () => {
        // Given
        mockUserRepository.findByEmailWithPassword.mockResolvedValue(null);

        // When & Then
        await expect(authService.authenticate('ghost@example.com', 'any')).rejects.toMatchObject({ status: 401 });
      });
    });

    describe('Когда пароль неверный', () => {
      it('должен выбросить 401 INVALID_CREDENTIALS, не уточняя что именно не так', async () => {
        // Given
        const user = await createUserDocument({ plainPassword: 'correct-password' });
        mockUserRepository.findByEmailWithPassword.mockResolvedValue(user);

        // When & Then
        await expect(authService.authenticate('test@example.com', 'wrong-password')).rejects.toMatchObject({
          status: 401,
        });
      });
    });

    describe('Когда email и пароль верны', () => {
      it('должен вернуть пользователя без поля password', async () => {
        // Given
        const user = await createUserDocument({ plainPassword: 'correct-password' });
        mockUserRepository.findByEmailWithPassword.mockResolvedValue(user);

        // When
        const result = await authService.authenticate('test@example.com', 'correct-password');

        // Then
        expect(result.email).toBe('test@example.com');
        expect(result).not.toHaveProperty('password');
      });
    });
  });

  describe('login', () => {
    describe('Когда email не подтверждён', () => {
      it('должен выбросить 403 EMAIL_NOT_VERIFIED, даже если пароль верный', async () => {
        // Given
        const user = await createUserDocument({ plainPassword: 'correct-password', isEmailVerified: false });
        mockUserRepository.findByEmailWithPassword.mockResolvedValue(user);

        // When & Then
        await expect(authService.login('test@example.com', 'correct-password')).rejects.toMatchObject({
          status: 403,
        });
      });
    });

    describe('Когда учётные данные верны и email подтверждён', () => {
      it('должен вернуть пару access/refresh токенов', async () => {
        // Given
        const user = await createUserDocument({ plainPassword: 'correct-password', isEmailVerified: true });
        mockUserRepository.findByEmailWithPassword.mockResolvedValue(user);

        // When
        const result = await authService.login('test@example.com', 'correct-password');

        // Then
        expect(typeof result.accessToken).toBe('string');
        expect(typeof result.refreshToken).toBe('string');
        expect(result.accessToken).not.toBe(result.refreshToken);
      });
    });
  });

  describe('changePassword', () => {
    describe('Когда текущий пароль указан неверно', () => {
      it('должен выбросить 400 и не трогать документ пользователя', async () => {
        // Given
        const user = await createUserDocument({ plainPassword: 'old-password' });
        const saveSpy = jest.spyOn(user, 'save');
        mockUserRepository.findByIdWithPassword.mockResolvedValue(user);

        // When & Then
        await expect(
          authService.changePassword(user._id.toString(), 'wrong-old-password', 'new-password')
        ).rejects.toMatchObject({ status: 400 });
        expect(saveSpy).not.toHaveBeenCalled();
      });
    });

    describe('Когда текущий пароль верный', () => {
      it('должен установить новый пароль и сохранить документ', async () => {
        // Given
        const user = await createUserDocument({ plainPassword: 'old-password' });
        const saveSpy = jest.spyOn(user, 'save').mockResolvedValue(user);
        mockUserRepository.findByIdWithPassword.mockResolvedValue(user);

        // When
        await authService.changePassword(user._id.toString(), 'old-password', 'new-password');

        // Then
        expect(user.password).toBe('new-password');
        expect(saveSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('verifyEmail', () => {
    describe('Когда токен не найден', () => {
      it('должен выбросить 400 INVALID_VERIFICATION_TOKEN', async () => {
        // Given
        mockUserRepository.findByEmailVerificationToken.mockResolvedValue(null);

        // When & Then
        await expect(authService.verifyEmail('unknown-token')).rejects.toMatchObject({ status: 400 });
      });
    });

    describe('Когда токен просрочен', () => {
      it('должен выбросить 400 VERIFICATION_TOKEN_EXPIRED', async () => {
        // Given
        const user = await createUserDocument({
          isEmailVerified: false,
          emailVerificationToken: 'expired-token',
          emailVerificationExpires: new Date(Date.now() - 1000),
        });
        mockUserRepository.findByEmailVerificationToken.mockResolvedValue(user);

        // When & Then
        await expect(authService.verifyEmail('expired-token')).rejects.toMatchObject({ status: 400 });
      });
    });

    describe('Когда токен валиден и не просрочен', () => {
      it('должен подтвердить email и очистить токен', async () => {
        // Given
        const user = await createUserDocument({
          isEmailVerified: false,
          emailVerificationToken: 'valid-token',
          emailVerificationExpires: new Date(Date.now() + 60_000),
        });
        jest.spyOn(user, 'save').mockResolvedValue(user);
        mockUserRepository.findByEmailVerificationToken.mockResolvedValue(user);

        // When
        const result = await authService.verifyEmail('valid-token');

        // Then
        expect(result.isEmailVerified).toBe(true);
        expect(result.emailVerificationToken).toBeNull();
      });
    });
  });

  describe('resendVerificationEmail', () => {
    describe('Когда пользователь не найден', () => {
      it('должен тихо завершиться без ошибки и без письма', async () => {
        // Given
        mockUserRepository.findByEmail.mockResolvedValue(null);

        // When
        await expect(authService.resendVerificationEmail('ghost@example.com')).resolves.toBeUndefined();

        // Then
        expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
      });
    });

    describe('Когда email уже подтверждён', () => {
      it('должен тихо завершиться без письма — не спалить факт существования аккаунта', async () => {
        // Given
        const user = await createUserDocument({ isEmailVerified: true });
        mockUserRepository.findByEmail.mockResolvedValue(user);

        // When
        await authService.resendVerificationEmail('test@example.com');

        // Then
        expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
      });
    });

    describe('Когда пользователь существует и email не подтверждён', () => {
      it('должен сгенерировать новый токен и отправить письмо', async () => {
        // Given
        const user = await createUserDocument({ isEmailVerified: false, emailVerificationToken: 'old-token' });
        jest.spyOn(user, 'save').mockResolvedValue(user);
        mockUserRepository.findByEmail.mockResolvedValue(user);
        mockEmailService.isConfigured.mockReturnValue(true);

        // When
        await authService.resendVerificationEmail('test@example.com');

        // Then
        expect(user.emailVerificationToken).not.toBe('old-token');
        expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
          'test@example.com',
          user.emailVerificationToken as string,
          'Test User'
        );
      });
    });
  });

  describe('refreshTokens', () => {
    describe('Когда refresh-токен синтаксически невалиден', () => {
      it('должен выбросить 401 INVALID_REFRESH_TOKEN', async () => {
        // When & Then
        await expect(authService.refreshTokens('garbage-not-a-jwt')).rejects.toMatchObject({ status: 401 });
      });
    });

    describe('Когда refresh-токен валиден, но пользователь уже удалён', () => {
      it('должен пробросить исходную ошибку userService.getById (404), а не подменять на 401', async () => {
        // Given — реальный jwtService, не мок: подписываем валидный refresh-токен несуществующему id
        const ghostUser = await createUserDocument({ _id: new Types.ObjectId() });
        const refreshToken = authService.generateRefreshToken(ghostUser);
        mockUserService.getById.mockRejectedValue(new AppError(404, 'Пользователь не найден'));

        // When & Then
        await expect(authService.refreshTokens(refreshToken)).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('Когда refresh-токен валиден и пользователь существует', () => {
      it('должен вернуть новую пару токенов', async () => {
        // Given
        const user = await createUserDocument();
        const refreshToken = authService.generateRefreshToken(user);
        mockUserService.getById.mockResolvedValue(user);

        // When
        const result = await authService.refreshTokens(refreshToken);

        // Then
        expect(typeof result.accessToken).toBe('string');
        expect(typeof result.refreshToken).toBe('string');
      });
    });

    describe('Когда в /refresh подсовывают access-токен вместо refresh', () => {
      it('должен отклонить его как невалидный (claim type не совпадает)', async () => {
        // Given
        const user = await createUserDocument();
        const accessToken = authService.generateAccessToken(user);

        // When & Then
        await expect(authService.refreshTokens(accessToken)).rejects.toMatchObject({ status: 401 });
      });
    });
  });

  describe('requestPasswordReset', () => {
    describe('Когда пользователь не найден', () => {
      it('должен тихо завершиться без письма — не спалить факт существования аккаунта', async () => {
        // Given
        mockUserRepository.findByEmail.mockResolvedValue(null);

        // When
        await expect(authService.requestPasswordReset('ghost@example.com')).resolves.toBeUndefined();

        // Then
        expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      });
    });

    describe('Когда пользователь существует', () => {
      it('должен сгенерировать токен сброса, сохранить документ и отправить письмо', async () => {
        // Given
        const user = await createUserDocument();
        jest.spyOn(user, 'save').mockResolvedValue(user);
        mockUserRepository.findByEmail.mockResolvedValue(user);
        mockEmailService.isConfigured.mockReturnValue(true);

        // When
        await authService.requestPasswordReset('test@example.com');

        // Then
        expect(user.passwordResetToken).toEqual(expect.any(String));
        expect(user.passwordResetExpires).toBeInstanceOf(Date);
        expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
          'test@example.com',
          user.passwordResetToken as string,
          'Test User'
        );
      });
    });
  });

  describe('resetPassword', () => {
    describe('Когда токен не найден', () => {
      it('должен выбросить 400 INVALID_RESET_TOKEN', async () => {
        // Given
        mockUserRepository.findByPasswordResetToken.mockResolvedValue(null);

        // When & Then
        await expect(authService.resetPassword('unknown-token', 'new-password123')).rejects.toMatchObject({
          status: 400,
        });
      });
    });

    describe('Когда токен просрочен', () => {
      it('должен выбросить 400 RESET_TOKEN_EXPIRED', async () => {
        // Given
        const user = await createUserDocument({
          passwordResetToken: 'expired-token',
          passwordResetExpires: new Date(Date.now() - 1000),
        });
        mockUserRepository.findByPasswordResetToken.mockResolvedValue(user);

        // When & Then
        await expect(authService.resetPassword('expired-token', 'new-password123')).rejects.toMatchObject({
          status: 400,
        });
      });
    });

    describe('Когда токен валиден и не просрочен', () => {
      it('должен установить новый пароль и очистить токен сброса', async () => {
        // Given
        const user = await createUserDocument({
          passwordResetToken: 'valid-token',
          passwordResetExpires: new Date(Date.now() + 60_000),
        });
        jest.spyOn(user, 'save').mockResolvedValue(user);
        mockUserRepository.findByPasswordResetToken.mockResolvedValue(user);

        // When
        await authService.resetPassword('valid-token', 'new-password123');

        // Then
        expect(user.password).toBe('new-password123');
        expect(user.passwordResetToken).toBeNull();
        expect(user.passwordResetExpires).toBeNull();
      });
    });
  });
});
