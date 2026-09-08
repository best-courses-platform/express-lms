import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import { Types } from 'mongoose';
import type { refreshSessionRepository as RefreshSessionRepositoryInstance } from '../refresh-session.repository';
import type { RefreshSessionDocument, RevokeReason } from '../refresh-session.types';

// Unit-слой: repository замокан целиком, реальный Mongo здесь не поднимается — тот же
// подход, что у auth.service.unit.spec.ts. Реальная транзакция claimAndCreateChild
// (внутри репозитория) проверяется на integration-уровне (auth.routes.integration.spec.ts).
jest.mock('../refresh-session.repository', () => ({
  refreshSessionRepository: {
    create: jest.fn(),
    findById: jest.fn(),
    claimAndCreateChild: jest.fn(),
    revokeById: jest.fn(),
    revokeFamily: jest.fn(),
    revokeAllForUser: jest.fn(),
    findActiveForUser: jest.fn(),
  },
}));

const { refreshSessionService } = require('../refresh-session.service') as {
  refreshSessionService: typeof import('../refresh-session.service').refreshSessionService;
};
const { refreshSessionRepository } = require('../refresh-session.repository') as {
  refreshSessionRepository: typeof RefreshSessionRepositoryInstance;
};

const mockRepo = refreshSessionRepository as jest.Mocked<typeof refreshSessionRepository>;

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const USER_ID = new Types.ObjectId().toString();
const CTX = { userAgent: 'jest', ip: '127.0.0.1' };

// Только поля, которые реально читает refresh-session.service.ts — не настоящий
// Mongoose-документ (методы вроде .save() сервису не нужны, репозиторий замокан целиком).
function makeSession(overrides: Partial<RefreshSessionDocument> = {}): RefreshSessionDocument {
  return {
    id: new Types.ObjectId().toString(),
    user: new Types.ObjectId(USER_ID),
    familyId: crypto.randomUUID(),
    tokenHash: sha256Hex('correct-secret'),
    expiresAt: new Date(Date.now() + 60_000),
    rotatedAt: null,
    revokedAt: null,
    revokedReason: null,
    replacedBySession: null,
    userAgent: null,
    ip: null,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as RefreshSessionDocument;
}

describe('RefreshSessionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('issue', () => {
    it('возвращает строку вида "id.secret" и кладёт в репозиторий sha256(secret), не сам секрет', async () => {
      // Given
      const created = makeSession();
      mockRepo.create.mockResolvedValue(created);

      // When
      const token = await refreshSessionService.issue(USER_ID, CTX);

      // Then
      const [id, secret] = token.split('.');
      expect(id).toBe(created.id);
      expect(secret).toBeTruthy();

      const createArg = mockRepo.create.mock.calls[0][0];
      expect(createArg.tokenHash).toBe(sha256Hex(secret));
      expect(createArg.tokenHash).not.toBe(secret);
      expect(createArg.user).toBe(USER_ID);
    });
  });

  describe('rotate', () => {
    it('валидный токен → новая пара, claimAndCreateChild вызван с familyId старой сессии', async () => {
      // Given
      const secret = 'valid-secret';
      const session = makeSession({ tokenHash: sha256Hex(secret) });
      const child = makeSession({ familyId: session.familyId });
      mockRepo.findById.mockResolvedValue(session);
      mockRepo.claimAndCreateChild.mockResolvedValue(child);

      // When
      const result = await refreshSessionService.rotate(`${session.id}.${secret}`, CTX);

      // Then
      expect(result.userId).toBe(session.user.toString());
      expect(result.refreshToken.startsWith(`${child.id}.`)).toBe(true);
      expect(mockRepo.claimAndCreateChild).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({ familyId: session.familyId })
      );
    });

    it('строка не вида "id.secret" → 401, репозиторий не трогается', async () => {
      await expect(refreshSessionService.rotate('not-a-valid-token', CTX)).rejects.toMatchObject({ status: 401 });
      expect(mockRepo.findById).not.toHaveBeenCalled();
    });

    it('несуществующий id → 401', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(refreshSessionService.rotate('507f1f77bcf86cd799439011.anysecret', CTX)).rejects.toMatchObject({
        status: 401,
      });
    });

    it('неверный secret при существующем id → 401', async () => {
      const session = makeSession({ tokenHash: sha256Hex('correct-secret') });
      mockRepo.findById.mockResolvedValue(session);

      await expect(refreshSessionService.rotate(`${session.id}.wrong-secret`, CTX)).rejects.toMatchObject({
        status: 401,
      });
      expect(mockRepo.claimAndCreateChild).not.toHaveBeenCalled();
    });

    it('просроченная сессия → 401', async () => {
      const secret = 'valid-secret';
      const session = makeSession({ tokenHash: sha256Hex(secret), expiresAt: new Date(Date.now() - 1000) });
      mockRepo.findById.mockResolvedValue(session);

      await expect(refreshSessionService.rotate(`${session.id}.${secret}`, CTX)).rejects.toMatchObject({
        status: 401,
      });
      expect(mockRepo.claimAndCreateChild).not.toHaveBeenCalled();
    });

    it('провёрнутый токен В ПРЕДЕЛАХ grace-window → 401, revokeFamily НЕ вызван (гонка, не кража)', async () => {
      const secret = 'already-rotated-secret';
      const session = makeSession({
        tokenHash: sha256Hex(secret),
        revokedAt: new Date(),
        revokedReason: 'rotated' as RevokeReason,
        rotatedAt: new Date(), // только что
      });
      mockRepo.findById.mockResolvedValue(session);

      await expect(refreshSessionService.rotate(`${session.id}.${secret}`, CTX)).rejects.toMatchObject({
        status: 401,
      });
      expect(mockRepo.revokeFamily).not.toHaveBeenCalled();
    });

    it('провёрнутый токен ВНЕ grace-window → revokeFamily("reuse-detected") вызван, 401', async () => {
      const secret = 'stolen-and-reused-secret';
      const session = makeSession({
        tokenHash: sha256Hex(secret),
        revokedAt: new Date(),
        revokedReason: 'rotated' as RevokeReason,
        rotatedAt: new Date(Date.now() - 60_000), // минуту назад — не гонка
      });
      mockRepo.findById.mockResolvedValue(session);

      await expect(refreshSessionService.rotate(`${session.id}.${secret}`, CTX)).rejects.toMatchObject({
        status: 401,
      });
      expect(mockRepo.revokeFamily).toHaveBeenCalledWith(session.familyId, 'reuse-detected');
    });

    it('сессия отозвана НЕ ротацией (logout/password-change) → 401 без revokeFamily — не reuse detection', async () => {
      const secret = 'logged-out-secret';
      const session = makeSession({
        tokenHash: sha256Hex(secret),
        revokedAt: new Date(),
        revokedReason: 'logout' as RevokeReason,
      });
      mockRepo.findById.mockResolvedValue(session);

      await expect(refreshSessionService.rotate(`${session.id}.${secret}`, CTX)).rejects.toMatchObject({
        status: 401,
      });
      expect(mockRepo.revokeFamily).not.toHaveBeenCalled();
    });

    it('claimAndCreateChild проиграл гонку (вернул null) → 401', async () => {
      const secret = 'valid-secret';
      const session = makeSession({ tokenHash: sha256Hex(secret) });
      mockRepo.findById.mockResolvedValue(session);
      mockRepo.claimAndCreateChild.mockResolvedValue(null);

      await expect(refreshSessionService.rotate(`${session.id}.${secret}`, CTX)).rejects.toMatchObject({
        status: 401,
      });
    });
  });

  describe('revokeByToken', () => {
    it('чужая сессия (expectedUserId не совпал) → no-op, revokeById не вызван', async () => {
      const session = makeSession();
      mockRepo.findById.mockResolvedValue(session);

      await refreshSessionService.revokeByToken(`${session.id}.anysecret`, 'logout', 'someone-else-id');

      expect(mockRepo.revokeById).not.toHaveBeenCalled();
    });

    it('битая строка токена → no-op, findById не вызывается', async () => {
      await refreshSessionService.revokeByToken('garbage', 'logout');

      expect(mockRepo.findById).not.toHaveBeenCalled();
      expect(mockRepo.revokeById).not.toHaveBeenCalled();
    });

    it('своя валидная сессия → revokeById вызван с той же причиной', async () => {
      const session = makeSession();
      mockRepo.findById.mockResolvedValue(session);

      await refreshSessionService.revokeByToken(`${session.id}.anysecret`, 'logout', session.user.toString());

      expect(mockRepo.revokeById).toHaveBeenCalledWith(session.id, 'logout');
    });
  });

  describe('list', () => {
    it('помечает текущую сессию по id из переданного raw-токена', async () => {
      const current = makeSession();
      const other = makeSession();
      mockRepo.findActiveForUser.mockResolvedValue([current, other]);

      const views = await refreshSessionService.list(USER_ID, `${current.id}.whatever`);

      expect(views.find(v => v.id === current.id)?.current).toBe(true);
      expect(views.find(v => v.id === other.id)?.current).toBe(false);
    });

    it('не отдаёт tokenHash/familyId — только публичную проекцию', async () => {
      const session = makeSession();
      mockRepo.findActiveForUser.mockResolvedValue([session]);

      const [view] = await refreshSessionService.list(USER_ID);

      expect(view).not.toHaveProperty('tokenHash');
      expect(view).not.toHaveProperty('familyId');
      expect(view).not.toHaveProperty('replacedBySession');
    });
  });
});
