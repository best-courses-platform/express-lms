import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { userService as UserServiceInstance } from 'users/user.service';
import type { User } from 'users/user.types';
import { Types } from 'mongoose';

// Unit-слой на сам verify-callback стратегии (второй аргумент конструктора Strategy) — то,
// что реально выполняется ПОСЛЕ того, как passport-oauth2 обменял код на accessToken у
// Google (сам обмен — чистый сетевой OAuth2-хендшейк внутри passport-oauth2, не наш код,
// тестировать нечего). passport хранит переданный verify-callback во внутреннем,
// нетипизированном свойстве `_verify` (см. node_modules/passport-oauth2/lib/strategy.js) —
// вызываем его напрямую с фейковым профилем вместо реального сетевого похода в Google.
// userService.findOrCreateFromOAuth сам по себе уже полностью покрыт в
// users/__tests__/user.service.unit.spec.ts — здесь проверяется только тонкая обвязка вокруг
// него: guard на отсутствие email и трансляция ошибок в форму done(err, user).
jest.mock('users/user.service', () => ({
  userService: { findOrCreateFromOAuth: jest.fn() },
}));

const { userService } = require('users/user.service') as { userService: typeof UserServiceInstance };
const { googleOAuthStrategy } = require('../google-oauth.strategy') as {
  googleOAuthStrategy: { _verify: (...args: unknown[]) => void };
};

const mockUserService = userService as jest.Mocked<typeof userService>;

function invokeVerify(profile: unknown): Promise<{ err: unknown; user: unknown }> {
  return new Promise(resolve => {
    googleOAuthStrategy._verify('access-token', 'refresh-token', profile, (err: unknown, user: unknown) =>
      resolve({ err, user })
    );
  });
}

function createMockUser(): User {
  return {
    _id: new Types.ObjectId(),
    name: 'Google User',
    email: 'google@example.com',
    role: 'student',
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;
}

describe('googleOAuthStrategy._verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Когда в профиле нет email', () => {
    it('должен вызвать done с ошибкой, не обращаясь к userService', async () => {
      // Given
      const profile = { id: 'google-1', emails: [] };

      // When
      const { err, user } = await invokeVerify(profile);

      // Then
      expect(err).toBeInstanceOf(Error);
      expect(user).toBe(false);
      expect(mockUserService.findOrCreateFromOAuth).not.toHaveBeenCalled();
    });
  });

  describe('Когда профиль валиден', () => {
    it('должен вызвать userService.findOrCreateFromOAuth с профилем как есть и done(null, user)', async () => {
      // Given
      const fakeUser = createMockUser();
      mockUserService.findOrCreateFromOAuth.mockResolvedValue(fakeUser);
      const profile = { id: 'google-1', emails: [{ value: 'google@example.com' }], displayName: 'Google User' };

      // When
      const { err, user } = await invokeVerify(profile);

      // Then
      expect(err).toBeNull();
      expect(user).toBe(fakeUser);
      expect(mockUserService.findOrCreateFromOAuth).toHaveBeenCalledWith(profile);
    });
  });

  describe('Когда userService.findOrCreateFromOAuth бросает ошибку', () => {
    it('должен вызвать done(error, false), не пробрасывать исключение наружу', async () => {
      // Given
      mockUserService.findOrCreateFromOAuth.mockRejectedValue(new Error('Mongo недоступен'));
      const profile = { id: 'google-1', emails: [{ value: 'google@example.com' }] };

      // When
      const { err, user } = await invokeVerify(profile);

      // Then
      expect(err).toBeInstanceOf(Error);
      expect(user).toBe(false);
    });
  });
});
