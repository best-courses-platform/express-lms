import crypto from 'crypto';
import { config } from '../../config';
import { parseDurationMs } from '../../utils/duration';
import { UnauthorizedError } from '../../utils/errors';
import { AUTH_MESSAGES } from './auth.constants';
import { refreshSessionRepository } from './refresh-session.repository';
import { RefreshSessionDocument, RevokeReason, SessionContext, SessionView } from './refresh-session.types';

// Провёрнутый токен, предъявленный в пределах этого окна после ротации — почти наверняка
// проигравший гонки (второй параллельный /refresh, дабл-клик, retry сети), не кража —
// см. заметку 31, раздел 5.4. Auth0 называет это "leeway", Okta — "grace period".
const ROTATION_GRACE_MS = 10_000;
const SECRET_BYTES = 32;

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// crypto.timingSafeEqual бросает исключение, если буферы разной длины, а не возвращает
// false — без явной проверки длины битая (например, повреждённая миграцией) запись
// tokenHash в БД уронила бы rotate() в 500 вместо обычного 401.
function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Формат — "<sessionId>.<secret>", тот же принцип, что у API-ключей Stripe/GitHub
// (показывается один раз, хранится хешем). id — hex ObjectId, secret — base64url,
// ни один из них не содержит ".", поэтому разделение по первой точке однозначно.
function parseRefreshToken(raw: string): { id: string; secret: string } {
  const dotIndex = raw.indexOf('.');

  if (dotIndex <= 0 || dotIndex === raw.length - 1) {
    throw new UnauthorizedError(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
  }

  return { id: raw.slice(0, dotIndex), secret: raw.slice(dotIndex + 1) };
}

function tryParseRefreshToken(raw: string): { id: string; secret: string } | null {
  try {
    return parseRefreshToken(raw);
  } catch {
    return null;
  }
}

class RefreshSessionService {
  // --- логин / OAuth-колбэк / login-local (через общий issueTokensFor в auth.service.ts) ---
  async issue(userId: string, ctx: SessionContext): Promise<string> {
    const secret = crypto.randomBytes(SECRET_BYTES).toString('base64url');

    const doc = await refreshSessionRepository.create({
      user: userId,
      familyId: crypto.randomUUID(),
      tokenHash: sha256Hex(secret),
      expiresAt: new Date(Date.now() + parseDurationMs(config.jwtRefreshExpiresIn)),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });

    return `${doc.id}.${secret}`;
  }

  // --- POST /api/auth/refresh ---
  async rotate(rawToken: string, ctx: SessionContext): Promise<{ userId: string; refreshToken: string }> {
    const { id, secret } = parseRefreshToken(rawToken);
    const session = await refreshSessionRepository.findById(id);

    if (!session || !timingSafeEqualHex(sha256Hex(secret), session.tokenHash)) {
      throw new UnauthorizedError(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
    }

    if (session.revokedAt) {
      await this.handleRevokedSessionReuse(session);
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
    }

    const newSecret = crypto.randomBytes(SECRET_BYTES).toString('base64url');
    const child = await refreshSessionRepository.claimAndCreateChild(session.id, {
      user: session.user,
      familyId: session.familyId,
      tokenHash: sha256Hex(newSecret),
      expiresAt: new Date(Date.now() + parseDurationMs(config.jwtRefreshExpiresIn)),
      userAgent: ctx.userAgent,
      ip: ctx.ip,
      lastUsedAt: new Date(),
    });

    if (!child) {
      // Между findById выше и атомарным claim'ом кто-то другой (параллельный /refresh,
      // либо logout) успел раньше нас — не reuse, просто проигранная гонка на этом же шаге.
      throw new UnauthorizedError(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
    }

    return { userId: session.user.toString(), refreshToken: `${child.id}.${newSecret}` };
  }

  // Вынесено отдельным методом — три разных исхода в одном if разрослись бы в
  // трудночитаемый блок прямо посреди rotate().
  private async handleRevokedSessionReuse(session: RefreshSessionDocument): Promise<never> {
    const rotatedRecently =
      session.revokedReason === 'rotated' &&
      session.rotatedAt &&
      Date.now() - session.rotatedAt.getTime() <= ROTATION_GRACE_MS;

    if (rotatedRecently) {
      // Гонка: клиент (или сеть с ретраем) послал два refresh почти одновременно. Один
      // выиграл и уже поставил новую cookie. Этот — просто отклоняем, семью НЕ гасим.
      // Иначе любой дабл-клик/retry разлогинивал бы живого пользователя.
      throw new UnauthorizedError(AUTH_MESSAGES.ERROR.INVALID_REFRESH_TOKEN);
    }

    if (session.revokedReason === 'rotated') {
      // Уже давно провёрнутый токен предъявлен снова — это не гонка. Классический признак
      // кражи: настоящий владелец провернул сессию дальше, а копию токена кто-то держал
      // и пустил в ход сейчас. Гасим всю семью — выкидываются оба.
      await refreshSessionRepository.revokeFamily(session.familyId, 'reuse-detected');
    }

    throw new UnauthorizedError(AUTH_MESSAGES.ERROR.SESSION_REVOKED);
  }

  // --- logout ---
  // best-effort: битый/отсутствующий токен на logout — не ошибка, cookie всё равно чистит
  // контроллер отдельно. expectedUserId — защита от того, чтобы одна украденная/подставная
  // cookie не позволила отозвать чужую сессию по чужому id.
  async revokeByToken(rawToken: string, reason: RevokeReason, expectedUserId?: string): Promise<void> {
    const parsed = tryParseRefreshToken(rawToken);
    if (!parsed) {
      return;
    }

    const session = await refreshSessionRepository.findById(parsed.id);
    if (!session || session.revokedAt) {
      return;
    }
    if (expectedUserId && session.user.toString() !== expectedUserId) {
      return;
    }

    await refreshSessionRepository.revokeById(session.id, reason);
  }

  // --- смена/сброс пароля, logout-all ---
  async revokeAllForUser(userId: string, reason: RevokeReason, opts: { exceptSessionId?: string } = {}): Promise<void> {
    await refreshSessionRepository.revokeAllForUser(userId, reason, opts.exceptSessionId);
  }

  // --- GET /api/auth/sessions ---
  async list(userId: string, currentRawToken?: string): Promise<SessionView[]> {
    const currentId = currentRawToken ? tryParseRefreshToken(currentRawToken)?.id : undefined;
    const rows = await refreshSessionRepository.findActiveForUser(userId);

    return rows.map(r => ({
      id: r.id,
      current: r.id === currentId,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      expiresAt: r.expiresAt,
      userAgent: r.userAgent,
      ip: r.ip,
    }));
  }
}

export const refreshSessionService = new RefreshSessionService();
