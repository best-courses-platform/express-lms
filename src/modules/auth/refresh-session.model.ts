import { model, Schema } from 'mongoose';
import { RefreshSession } from './refresh-session.types';

const refreshSessionSchema = new Schema<RefreshSession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true },

    expiresAt: { type: Date, required: true },

    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      // null явно в списке enum — иначе Mongoose валидирует enum и для null-значения тоже
      // (default: null задаёт начальное значение, но не освобождает его от последующей
      // валидации при save()); без этого КАЖДЫЙ save() свежесозданной, ещё не отозванной
      // сессии падал с "RefreshSession validation failed: revokedReason: ... value: null".
      enum: ['rotated', 'logout', 'logout-all', 'password-change', 'reuse-detected', 'user-deleted', 'admin', null],
      default: null,
    },
    replacedBySession: { type: Schema.Types.ObjectId, ref: 'RefreshSession', default: null },

    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Автоочистка: как только expiresAt в прошлом — Mongo сам удаляет запись (фоновый reaper
// проходит раз в ~60с, не мгновенно на момент истечения — в коде expiresAt всё равно
// проверяется явно, эта TTL — только уборка мусора, не единственная защита).
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Быстрый путь для "покажи мои активные сессии" и "погаси все у пользователя".
refreshSessionSchema.index({ user: 1, revokedAt: 1 });

export const RefreshSessionModel = model<RefreshSession>('RefreshSession', refreshSessionSchema);
