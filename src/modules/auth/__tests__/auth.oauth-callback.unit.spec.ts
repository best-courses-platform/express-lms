import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import type { authService as AuthServiceInstance } from '../auth.service';
import type { jwtService as JwtServiceInstance } from 'jwt/jwt.service';
import type { User } from 'users/user.types';

// Unit-слой на контроллеры handleLoginSuccess/handleOAuthCallback — единственная реально
// тестируемая часть OAuth-потока без сети. Сама верификация профиля Google/GitHub
// (googleOAuthStrategy/githubOAuthStrategy) делегирует в userService.findOrCreateFromOAuth,
// уже покрытый в users/__tests__/user.service.unit.spec.ts — здесь же то, что происходит
// ПОСЛЕ того, как passport успешно отработал и положил пользователя в req.user: генерация
// токенов, простановка cookie, редирект на фронтенд (или экран ошибки). Именно эта часть
// раньше была отмечена как непокрытая ("итог по покрытию auth") — не потому что сложно
// написать логику, а потому что раньше не было способа сюда добраться без реального
// сетевого OAuth-хендшейка. Прогон через реальный HTTP-роут (googleAuthCallback middleware)
// потребовал бы либо реального сетевого вызова к Google, либо мока самой passport-стратегии —
// это отдельная, более тяжёлая задача; вызов функций-контроллеров напрямую даёт то же
// покрытие бизнес-логики за куда меньшую цену.
jest.mock('../auth.service', () => ({
  authService: {
    isValidUser: jest.fn(),
    generateAccessToken: jest.fn(),
    generateRefreshToken: jest.fn(),
  },
}));
jest.mock('jwt/jwt.service', () => ({
  jwtService: {
    setTokensCookies: jest.fn(),
  },
}));

const { authService } = require('../auth.service') as { authService: typeof AuthServiceInstance };
const { jwtService } = require('jwt/jwt.service') as { jwtService: typeof JwtServiceInstance };
const { handleLoginSuccess, handleOAuthCallback } = require('../auth.controller') as {
  handleLoginSuccess: (req: Request, res: Response, next: (err?: unknown) => void) => Promise<void>;
  handleOAuthCallback: (req: Request, res: Response, next: (err?: unknown) => void) => Promise<void>;
};

const mockAuthService = authService as jest.Mocked<typeof authService>;
const mockJwtService = jwtService as jest.Mocked<typeof jwtService>;

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    _id: new Types.ObjectId(),
    name: 'OAuth User',
    email: 'oauth@example.com',
    role: 'student',
    isEmailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

function createMockResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    redirect: jest.fn(),
  } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}

describe('handleLoginSuccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Когда req.user отсутствует', () => {
    it('должен вернуть 401, не генерируя токены', async () => {
      // Given
      const req = {} as Request;
      const res = createMockResponse();

      // When
      await handleLoginSuccess(req, res, jest.fn());

      // Then
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockAuthService.generateAccessToken).not.toHaveBeenCalled();
      expect(mockJwtService.setTokensCookies).not.toHaveBeenCalled();
    });
  });

  describe('Когда req.user не проходит authService.isValidUser', () => {
    it('должен вернуть 401 (например, passport положил false/некорректный объект)', async () => {
      // Given
      mockAuthService.isValidUser.mockReturnValue(false);
      const req = { user: {} } as Request;
      const res = createMockResponse();

      // When
      await handleLoginSuccess(req, res, jest.fn());

      // Then
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Когда req.user валиден', () => {
    it('должен сгенерировать пару токенов, проставить cookie и вернуть пользователя в ответе', async () => {
      // Given
      const user = createMockUser();
      mockAuthService.isValidUser.mockReturnValue(true);
      mockAuthService.generateAccessToken.mockReturnValue('access-token-123');
      mockAuthService.generateRefreshToken.mockReturnValue('refresh-token-456');
      const req = { user } as unknown as Request;
      const res = createMockResponse();

      // When
      await handleLoginSuccess(req, res, jest.fn());

      // Then
      expect(mockJwtService.setTokensCookies).toHaveBeenCalledWith(res, 'access-token-123', 'refresh-token-456');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'access-token-123',
          user: expect.objectContaining({ id: user._id.toString(), email: user.email, role: user.role }),
        })
      );
    });
  });

  describe('Когда генерация токена бросает ошибку', () => {
    it('должен передать её в next(), не отвечать клиенту напрямую', async () => {
      // Given
      const user = createMockUser();
      mockAuthService.isValidUser.mockReturnValue(true);
      mockAuthService.generateAccessToken.mockImplementation(() => {
        throw new Error('jwt secret misconfigured');
      });
      const req = { user } as unknown as Request;
      const res = createMockResponse();
      const next = jest.fn();

      // When
      await handleLoginSuccess(req, res, next);

      // Then
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});

describe('handleOAuthCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Когда req.user отсутствует или невалиден', () => {
    it('должен сделать редирект на страницу логина фронтенда с error=auth_failed, не бросая исключение', async () => {
      // Given — редирект на абсолютный URL фронтенда, не на относительный путь: после
      // OAuth-редиректа текущий origin — сам Express, не фронтенд (см. комментарий в
      // middleware/auth.ts про ту же причину для googleAuthCallback).
      mockAuthService.isValidUser.mockReturnValue(false);
      const req = {} as Request;
      const res = createMockResponse();

      // When
      await handleOAuthCallback(req, res, jest.fn());

      // Then
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/login?error=auth_failed'));
      expect(mockJwtService.setTokensCookies).not.toHaveBeenCalled();
    });
  });

  describe('Когда req.user валиден', () => {
    it('должен сгенерировать токены, проставить cookie и сделать редирект на frontendUrl без query-параметров ошибки', async () => {
      // Given
      const user = createMockUser();
      mockAuthService.isValidUser.mockReturnValue(true);
      mockAuthService.generateAccessToken.mockReturnValue('access-token-123');
      mockAuthService.generateRefreshToken.mockReturnValue('refresh-token-456');
      const req = { user } as unknown as Request;
      const res = createMockResponse();

      // When
      await handleOAuthCallback(req, res, jest.fn());

      // Then
      expect(mockJwtService.setTokensCookies).toHaveBeenCalledWith(res, 'access-token-123', 'refresh-token-456');
      const redirectUrl = (res.redirect as jest.Mock).mock.calls[0][0] as string;
      expect(redirectUrl).not.toContain('error=auth_failed');
    });
  });

  describe('Когда генерация токена бросает ошибку', () => {
    it('должен передать её в next(), не пытаться редиректить с невалидным состоянием', async () => {
      // Given
      const user = createMockUser();
      mockAuthService.isValidUser.mockReturnValue(true);
      mockAuthService.generateAccessToken.mockImplementation(() => {
        throw new Error('jwt secret misconfigured');
      });
      const req = { user } as unknown as Request;
      const res = createMockResponse();
      const next = jest.fn();

      // When
      await handleOAuthCallback(req, res, next);

      // Then
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });
});
