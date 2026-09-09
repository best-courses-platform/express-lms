import { HydratedDocument, Types } from 'mongoose';

// Причина, по которой сессия перестала быть активной — не только "отозвана вручную":
// 'rotated' — штатный обмен на потомка (не компрометация, нормальный цикл жизни).
export type RevokeReason =
  | 'rotated'
  | 'logout'
  | 'logout-all'
  | 'password-change'
  | 'reuse-detected'
  | 'user-deleted'
  | 'admin';

export type RefreshSession = {
  _id: Types.ObjectId;
  user: Types.ObjectId;

  // Все токены-потомки одного первоначального логина — общий familyId. Ротация сохраняет
  // его у потомка; reuse detection гасит семью целиком, не одну запись.
  familyId: string;

  // sha256(secret) в hex — сам секрет в БД никогда не попадает, тот же принцип, что и с
  // хешем пароля (см. Хранение паролей и защитные библиотеки).
  tokenHash: string;

  // Абсолютный срок жизни ЭТОЙ записи — при ротации у потомка выставляется заново
  // (TTL скользящий, см. заметку 31, раздел 6).
  expiresAt: Date;

  rotatedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: RevokeReason | null;
  replacedBySession: Types.ObjectId | null;

  // Для экрана "активные сессии" — не для проверок безопасности (UA/IP подделываются).
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
};

export type RefreshSessionDocument = HydratedDocument<RefreshSession>;

export type NewRefreshSession = {
  user: Types.ObjectId | string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt?: Date;
};

// Контекст запроса, из которого выдаётся/обменивается сессия — только для отображения
// в списке "активные сессии", не для проверок безопасности (см. комментарий у полей выше).
export type SessionContext = {
  userAgent: string | null;
  ip: string | null;
};

// Публичная проекция для GET /api/auth/sessions — намеренно НЕ включает tokenHash,
// familyId, replacedBySession: клиенту знать о них незачем, а tokenHash — секрет.
export type SessionView = {
  id: string;
  current: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
};
