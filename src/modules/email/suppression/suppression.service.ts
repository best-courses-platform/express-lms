import { suppressionRepository, SuppressionEntry } from './suppression.repository';

// Адрес приводится к каноническому виду: в нижний регистр и без пробелов. Часть после `+` НЕ
// отбрасывается (в отличие от стоп-листа Postbox): отказ по user+a@ не означает, что user@ мёртв.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class SuppressionService {
  async isSuppressed(email: string): Promise<boolean> {
    return (await suppressionRepository.findByEmail(normalizeEmail(email))) !== null;
  }

  async suppress(entry: SuppressionEntry): Promise<void> {
    await suppressionRepository.upsert({ ...entry, email: normalizeEmail(entry.email) });
  }

  // Снять блокировку вручную (например, адрес починили, а отказ был временным по сути).
  async unsuppress(email: string): Promise<boolean> {
    return await suppressionRepository.remove(normalizeEmail(email));
  }
}

export const suppressionService = new SuppressionService();
