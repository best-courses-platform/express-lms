import { EmailMessage, EmailSender } from './email.sender';

export interface SuppressionChecker {
  isSuppressed(email: string): Promise<boolean>;
}

// Обёртка над любым транспортом: адрес из списка подавления пропускается ещё до провайдера.
// Ошибка проверки (например, БД недоступна) НЕ глотается — отправка падает и очередь ретраит:
// лучше задержать письмо, чем слать на заведомо мёртвый адрес и портить репутацию домена.
export class SuppressionAwareEmailSender implements EmailSender {
  constructor(
    private readonly inner: EmailSender,
    private readonly suppression: SuppressionChecker
  ) {}

  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    if (await this.suppression.isSuppressed(message.to)) {
      console.warn(`Email не отправлен: адрес ${message.to} в списке подавления`);
      return { providerMessageId: 'suppressed' };
    }
    return this.inner.send(message);
  }
}
