export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Порт транспорта: EmailService (шаблоны + обработка ошибок) ничего не знает про nodemailer
// или конкретного провайдера — адаптеры подставляются по config.email.driver
// (см. email.sender-factory.ts). Смена провайдера = новый адаптер, а не правка сервиса.
export interface EmailSender {
  send(message: EmailMessage): Promise<{ providerMessageId: string }>;
}

// Тот же формат From, что был в EmailService до выноса адаптеров: имя = локальная часть адреса.
export function formatFromAddress(from: string): string {
  return `"${from.split('@')[0]}" <${from}>`;
}
