import { EmailSuppression, EmailSuppressionModel, SuppressionReason } from './suppression.model';

export interface SuppressionEntry {
  email: string;
  reason: SuppressionReason;
  detail?: string;
  eventId?: string;
  messageId?: string;
}

export class SuppressionRepository {
  // upsert идемпотентен: одно и то же событие можно безопасно обработать повторно (при рестарте
  // потребителя события читаются заново от последней контрольной точки). Повторная запись
  // перезаписывает причину — жалоба (complaint) важнее ранее записанного отказа.
  async upsert(entry: SuppressionEntry): Promise<void> {
    await EmailSuppressionModel.updateOne({ email: entry.email }, { $set: entry }, { upsert: true }).exec();
  }

  async findByEmail(email: string): Promise<EmailSuppression | null> {
    return await EmailSuppressionModel.findOne({ email }).lean().exec();
  }

  async remove(email: string): Promise<boolean> {
    const result = await EmailSuppressionModel.deleteOne({ email }).exec();
    return result.deletedCount > 0;
  }
}

export const suppressionRepository = new SuppressionRepository();
