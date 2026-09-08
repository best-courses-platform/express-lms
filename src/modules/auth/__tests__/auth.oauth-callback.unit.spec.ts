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
// ПОСЛЕ того, как passport успешно отработал и положил пользователя в req.user: выпуск
// пары токенов (issueTokensFor — единая точка для login/login-local/OAuth, см. заметку 31),
// простановка cookie, редирект на фронтенд (или экран ошибки). Прогон через реальный
// HTTP-роут (googleAuthCallback middleware) потребовал бы либо реального сетевого вызова
// к Google, либо мока самой passport-стратегии — вызов функций-контроллеров напрямую даёт
// то же покрытие бизнес-логики за куда меньшую цену.
jest.mock('../auth.service', () => ({
  authService: {
    isValidUser: jest.fn(),
    issueTokensFor: jest.fn(),
  },
}));
jest.mock('jwt/jwt.service', () => ({
  jwtService: {
    setTokensCookies: jest.fn(),
  },
}));

const { authService } = require('../auth.service') as { authService: typeof AuthServiceInstance };
const { jwtService } = require('jwt/jwt.service') as { jwtService: typeof JwtServiceInstance };
// Через AuthController.*, не напрямую именованные экспорты — с asyncHandler'ом именно
// AuthController.handleLoginSuccess/handleOAuthCallback (а не "сырые" функции) отвечают за
// next(err) при реджекте, см. middleware/async-handler.ts.
const { AuthController } = require('../auth.controller') as {
  AuthController: {
    handleLoginSuccess: (req: Request, res: Response, next: (err?: unknown) => void) => Promise<void>;
    handleOAuthCallback: (req: Request, res: Response, next: (err?: unknown) => void) => Promise<void>;
  };
};
const { handleLoginSuccess, handleOAuthCallback } = AuthController;

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

// sessionContext() в auth.controller.ts зовёт req.get('user-agent')/req.ip на любом запросе,
// включая ветки "req.user отсутствует" ниже — без get() как функции это упало бы с
// "req.get is not a function" ещё до проверки req.user, независимо от сценария теста.
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    get: jest.fn().mockReturnValue(undefined),
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as Request;
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
    it('должен вернуть 401, не выпуская токены', async () => {
      // Given
      const req = createMockRequest();
      const res = createMockResponse();

      // When
      await handleLoginSuccess(req, res, jest.fn());

      // Then
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockAuthService.issueTokensFor).not.toHaveBeenCalled();
      expect(mockJwtService.setTokensCookies).not.toHaveBeenCalled();
    });
  });

  describe('Когда req.user не проходит authService.isValidUser', () => {
    it('должен вернуть 401 (например, passport положил false/некорректный объект)', async () => {
      // Given
      mockAuthService.isValidUser.mockReturnValue(false);
      const req = createMockRequest({ user: {} } as Partial<Request>);
      const res = createMockResponse();

      // When
      await handleLoginSuccess(req, res, jest.fn());

      // Then
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Когда req.user валиден', () => {
    it('должен выпустить пару токенов через issueTokensFor, проставить cookie и вернуть пользователя в ответе', async () => {
      // Given
      const user = createMockUser();
      mockAuthService.isValidUser.mockReturnValue(true);
      mockAuthService.issueTokensFor.mockResolvedValue({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      });
      const req = createMockRequest({ user } as unknown as Partial<Request>);
      const res = createMockResponse();

      // When
      await handleLoginSuccess(req, res, jest.fn());

      // Then
      expect(mockAuthService.issueTokensFor).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ userAgent: null, ip: '127.0.0.1' })
      );
      expect(mockJwtService.setTokensCookies).toHaveBeenCalledWith(res, 'access-token-123', 'refresh-token-456');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'access-token-123',
          user: expect.objectContaining({ id: user._id.toString(), email: user.email, role: user.role }),
        })
      );
    });
  });

  describe('Когда выпуск токенов бросает ошибку', () => {
    it('должен передать её в next(), не отвечать клиенту напрямую', async () => {
      // Given
      const user = createMockUser();
      mockAuthService.isValidUser.mockReturnValue(true);
      mockAuthService.issueTokensFor.mockRejectedValue(new Error('jwt secret misconfigured'));
      const req = createMockRequest({ user } as unknown as Partial<Request>);
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
      const req = createMockRequest();
      const res = createMockResponse();

      // When
      await handleOAuthCallback(req, res, jest.fn());

      // Then
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/login?error=auth_failed'));
      expect(mockJwtService.setTokensCookies).not.toHaveBeenCalled();
    });
  });

  describe('Когда req.user валиден', () => {
    it('должен выпустить токены через issueTokensFor, проставить cookie и сделать редирект на frontendUrl без query-параметров ошибки', async () => {
      // Given
      const user = createMockUser();
      mockAuthService.isValidUser.mockReturnValue(true);
      mockAuthService.issueTokensFor.mockResolvedValue({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      });
      const req = createMockRequest({ user } as unknown as Partial<Request>);
      const res = createMockResponse();

      // When
      await handleOAuthCallback(req, res, jest.fn());

      // Then
      expect(mockJwtService.setTokensCookies).toHaveBeenCalledWith(res, 'access-token-123', 'refresh-token-456');
      const redirectUrl = (res.redirect as jest.Mock).mock.calls[0][0] as string;
      expect(redirectUrl).not.toContain('error=auth_failed');
    });
  });

  describe('Когда выпуск токенов бросает ошибку', () => {
    it('должен передать её в next(), не пытаться редиректить с невалидным состоянием', async () => {
      // Given
      const user = createMockUser();
      mockAuthService.isValidUser.mockReturnValue(true);
      mockAuthService.issueTokensFor.mockRejectedValue(new Error('jwt secret misconfigured'));
      const req = createMockRequest({ user } as unknown as Partial<Request>);
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
