import mongoose, { Types } from 'mongoose';
import { RefreshSessionModel } from './refresh-session.model';
import { NewRefreshSession, RefreshSessionDocument, RevokeReason } from './refresh-session.types';

class RefreshSessionRepository {
  async create(input: NewRefreshSession): Promise<RefreshSessionDocument> {
    return await RefreshSessionModel.create(input);
  }

  async findById(id: string): Promise<RefreshSessionDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return await RefreshSessionModel.findById(id).exec();
  }

  // Атомарная ротация: пометить старую запись провёрнутой + создать потомка — либо оба
  // шага, либо ни одного. `findOneAndUpdate({ _id, revokedAt: null }, ...)` — это и есть
  // сам "claim": физически выиграть его может только один параллельный запрос, остальные
  // получат null и должны трактовать это как проигрыш гонки, не как ошибку данных
  // (см. refresh-session.service.ts — reuse detection и grace-window разбираются уже там,
  // здесь только механика транзакции, тот же принцип разделения, что у courseRepository.addRating).
  async claimAndCreateChild(sessionId: string, child: NewRefreshSession): Promise<RefreshSessionDocument | null> {
    const session = await mongoose.startSession();
    let createdChild: RefreshSessionDocument | null = null;

    try {
      await session.withTransaction(async () => {
        const claimed = await RefreshSessionModel.findOneAndUpdate(
          { _id: sessionId, revokedAt: null },
          { $set: { revokedAt: new Date(), rotatedAt: new Date(), revokedReason: 'rotated' as RevokeReason } },
          { new: false, session }
        ).exec();

        if (!claimed) {
          // Кто-то другой уже выиграл ротацию этой же записи раньше нас — не ошибка
          // данных, а проигранная гонка. Транзакция ничего не должна закоммитить.
          return;
        }

        const [createdDoc] = await RefreshSessionModel.create([child], { session });
        createdChild = createdDoc;

        await RefreshSessionModel.updateOne(
          { _id: sessionId },
          { $set: { replacedBySession: createdDoc._id } },
          { session }
        ).exec();
      });

      return createdChild;
    } finally {
      await session.endSession();
    }
  }

  async revokeById(id: string, reason: RevokeReason): Promise<void> {
    await RefreshSessionModel.updateOne(
      { _id: id, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } }
    ).exec();
  }

  async revokeFamily(familyId: string, reason: RevokeReason): Promise<void> {
    await RefreshSessionModel.updateMany(
      { familyId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: reason } }
    ).exec();
  }

  async revokeAllForUser(userId: string, reason: RevokeReason, exceptSessionId?: string): Promise<void> {
    const filter: Record<string, unknown> = { user: userId, revokedAt: null };

    if (exceptSessionId && Types.ObjectId.isValid(exceptSessionId)) {
      filter._id = { $ne: new Types.ObjectId(exceptSessionId) };
    }

    await RefreshSessionModel.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } }).exec();
  }

  async findActiveForUser(userId: string): Promise<RefreshSessionDocument[]> {
    return await RefreshSessionModel.find({ user: userId, revokedAt: null }).sort({ createdAt: -1 }).exec();
  }
}

export const refreshSessionRepository = new RefreshSessionRepository();
