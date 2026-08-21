import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { userService as UserServiceInstance } from 'users/user.service';
import type { User } from 'users/user.types';
import { Types } from 'mongoose';

// Unit-слой на verify-callback github-oauth.strategy.ts (см. обоснование в
// google-oauth.strategy.unit.spec.ts — _verify вызывается напрямую, без реального сетевого
// OAuth-хендшейка). GitHub-стратегия сложнее google — если в профиле нет email (частый
// случай, если у пользователя приватный email на GitHub), она сама делает дополнительный
// запрос к api.github.com/user/emails через глобальный fetch, который здесь тоже мокается.
jest.mock('users/user.service', () => ({
  userService: { findOrCreateFromOAuth: jest.fn() },
}));

const { userService } = require('users/user.service') as { userService: typeof UserServiceInstance };
const { githubOAuthStrategy } = require('../github-oauth.strategy') as {
  githubOAuthStrategy: { _verify: (...args: unknown[]) => void };
};

const mockUserService = userService as jest.Mocked<typeof userService>;

function invokeVerify(accessToken: string | undefined, profile: unknown): Promise<{ err: unknown; user: unknown }> {
  return new Promise(resolve => {
    githubOAuthStrategy._verify(accessToken, 'refresh-token', profile, (err: unknown, user: unknown) =>
      resolve({ err, user })
    );
  });
}

function stubFetch(impl?: () => Promise<unknown>): jest.Mock {
  const fetchMock = jest.fn(impl) as unknown as jest.Mock;
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function createMockUser(): User {
  return {
    _id: new Types.ObjectId(),
    name: 'GitHub User',
    email: 'github@example.com',
    role: 'student',
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;
}

describe('githubOAuthStrategy._verify', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Когда в профиле уже есть email', () => {
    it('не должен обращаться к GitHub API, должен вызвать findOrCreateFromOAuth и done(null, user)', async () => {
      // Given
      const fetchMock = stubFetch();
      const fakeUser = createMockUser();
      mockUserService.findOrCreateFromOAuth.mockResolvedValue(fakeUser);
      const profile = { id: 'gh-1', emails: [{ value: 'github@example.com' }], displayName: 'GitHub User' };

      // When
      const { err, user } = await invokeVerify('access-token', profile);

      // Then
      expect(err).toBeNull();
      expect(user).toBe(fakeUser);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockUserService.findOrCreateFromOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'github', emails: [{ value: 'github@example.com' }] })
      );
    });

    it('должен проставить provider: github и displayName-fallback на username, независимо от email', async () => {
      stubFetch();
      mockUserService.findOrCreateFromOAuth.mockResolvedValue(createMockUser());
      const profile = { id: 'gh-1', emails: [{ value: 'github@example.com' }], username: 'octocat' };

      await invokeVerify('access-token', profile);

      expect(mockUserService.findOrCreateFromOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'octocat', provider: 'github' })
      );
    });
  });

  describe('Когда в профиле нет email, но есть accessToken', () => {
    it('должен запросить /user/emails и использовать primary+verified адрес', async () => {
      // Given
      const fetchMock = stubFetch(async () => ({
        ok: true,
        json: async () => [
          { email: 'secondary@example.com', primary: false, verified: true, visibility: 'public' },
          { email: 'primary@example.com', primary: true, verified: true, visibility: null },
        ],
      }));
      mockUserService.findOrCreateFromOAuth.mockResolvedValue(createMockUser());
      const profile = { id: 'gh-1', emails: [] };

      // When
      const { err } = await invokeVerify('access-token', profile);

      // Then
      expect(err).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.github.com/user/emails',
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer access-token' }) })
      );
      expect(mockUserService.findOrCreateFromOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ emails: [{ value: 'primary@example.com' }] })
      );
    });

    it('должен использовать первый email из списка, если нет primary+verified', async () => {
      stubFetch(async () => ({
        ok: true,
        json: async () => [{ email: 'only@example.com', primary: false, verified: false, visibility: null }],
      }));
      mockUserService.findOrCreateFromOAuth.mockResolvedValue(createMockUser());

      await invokeVerify('access-token', { id: 'gh-1', emails: [] });

      expect(mockUserService.findOrCreateFromOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ emails: [{ value: 'only@example.com' }] })
      );
    });

    it('должен вызвать done с ошибкой, если GitHub API не вернул ни одного email', async () => {
      // Given — регрессия: без явной ошибки здесь findOrCreateFromOAuth получил бы профиль
      // без emails вообще и упал бы с менее понятной ошибкой на совершенно другом уровне.
      stubFetch(async () => ({ ok: true, json: async () => [] }));

      // When
      const { err, user } = await invokeVerify('access-token', { id: 'gh-1', emails: [] });

      // Then
      expect(err).toBeInstanceOf(Error);
      expect(user).toBe(false);
      expect(mockUserService.findOrCreateFromOAuth).not.toHaveBeenCalled();
    });

    it('должен вызвать done с ошибкой, если запрос к GitHub API упал по сети (fetch throw)', async () => {
      // Given — сетевая ошибка внутри try/catch внутри стратегии не должна протечь наружу
      // необработанным исключением из verify-callback.
      stubFetch(() => Promise.reject(new Error('network down')));

      // When
      const { err, user } = await invokeVerify('access-token', { id: 'gh-1', emails: [] });

      // Then
      expect(err).toBeInstanceOf(Error);
      expect(user).toBe(false);
      expect(mockUserService.findOrCreateFromOAuth).not.toHaveBeenCalled();
    });
  });

  describe('Когда нет ни email в профиле, ни accessToken', () => {
    it('должен вызвать done с ошибкой, не обращаясь к GitHub API вообще', async () => {
      const fetchMock = stubFetch();

      const { err, user } = await invokeVerify(undefined, { id: 'gh-1', emails: [] });

      expect(err).toBeInstanceOf(Error);
      expect(user).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('Когда userService.findOrCreateFromOAuth бросает Error', () => {
    it('должен вызвать done(error, false)', async () => {
      stubFetch();
      mockUserService.findOrCreateFromOAuth.mockRejectedValue(new Error('Mongo недоступен'));

      const { err, user } = await invokeVerify('access-token', { id: 'gh-1', emails: [{ value: 'x@example.com' }] });

      expect(err).toBeInstanceOf(Error);
      expect(user).toBe(false);
    });
  });
});
