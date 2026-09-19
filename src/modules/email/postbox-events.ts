import type { SuppressionEntry } from './suppression.repository';

// Формат уведомлений Postbox — docs: postbox/concepts/notification. Разбираются только нужные
// нам поля; набор и порядок остальных может меняться.
export interface PostboxEvent {
  eventType: string;
  eventId?: string;
  mail?: { messageId?: string };
  bounce?: {
    bounceType?: string;
    bounceSubType?: string;
    bouncedRecipients?: { emailAddress?: string; diagnosticCode?: string }[];
  };
  complaint?: {
    complainedRecipients?: { emailAddress?: string }[];
    complaintFeedbackType?: string;
  };
}

// Подтипы отказа, не связанные с самим адресом получателя: сервер получателя не удовлетворяет
// требованиям TLS, которые мы (или конфигурация) поставили. Адрес при этом может быть живым.
const TLS_BOUNCE_SUBTYPES = new Set([
  'InsufficientTLS',
  'StartTlsNotOffered',
  'TlsCertificateUntrusted',
  'TlsVersionTooLow',
]);

// Сервер получателя отклонил письмо как спам: проблема в письме или репутации отправителя, а не в
// адресе. Подавлять такой адрес значило бы навсегда лишить человека писем (например, сброса пароля).
const SPAM_REJECTION_DIAGNOSTIC = 'Spam detected';

export function parsePostboxEvent(data: Uint8Array | string): PostboxEvent | null {
  try {
    const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf-8');
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as PostboxEvent).eventType === 'string') {
      return parsed as PostboxEvent;
    }
    return null;
  } catch {
    return null;
  }
}

// Какие адреса и почему надо внести в список подавления по событию. Пустой массив — событие не
// требует подавления (доставка, открытие, задержка, отказ не по вине адреса и т.д.).
export function toSuppressions(event: PostboxEvent): SuppressionEntry[] {
  const base = { eventId: event.eventId, messageId: event.mail?.messageId };

  if (event.eventType === 'Bounce' && event.bounce?.bounceType === 'Permanent') {
    const subType = event.bounce.bounceSubType;
    if (subType && TLS_BOUNCE_SUBTYPES.has(subType)) {
      return [];
    }
    return (event.bounce.bouncedRecipients ?? [])
      .filter(recipient => recipient.emailAddress && recipient.diagnosticCode !== SPAM_REJECTION_DIAGNOSTIC)
      .map(recipient => ({
        ...base,
        email: recipient.emailAddress as string,
        reason: 'bounce' as const,
        detail: [subType, recipient.diagnosticCode].filter(Boolean).join(': '),
      }));
  }

  if (event.eventType === 'Complaint' && event.complaint?.complaintFeedbackType !== 'not-spam') {
    return (event.complaint?.complainedRecipients ?? [])
      .filter(recipient => recipient.emailAddress)
      .map(recipient => ({
        ...base,
        email: recipient.emailAddress as string,
        reason: 'complaint' as const,
        detail: event.complaint?.complaintFeedbackType,
      }));
  }

  return [];
}

export interface SuppressionWriter {
  suppress(entry: SuppressionEntry): Promise<void>;
}

// Применяет событие: возвращает, сколько адресов внесено в список подавления.
export async function handlePostboxEvent(event: PostboxEvent, suppression: SuppressionWriter): Promise<number> {
  const entries = toSuppressions(event);
  for (const entry of entries) {
    await suppression.suppress(entry);
    console.warn(`📭 ${event.eventType}: ${entry.email} внесён в список подавления (${entry.detail ?? entry.reason})`);
  }
  return entries.length;
}
