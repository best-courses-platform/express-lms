import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { EmailMessage, EmailSender, formatFromAddress } from '../email.sender';

export interface PostboxEmailSenderOptions {
  keyId: string;
  secret: string;
  region: string;
  endpoint: string;
  from: string;
}

// Yandex Cloud Postbox — SES-совместимый HTTP API. Статический ключ сервисного аккаунта
// (роль postbox.sender) работает напрямую через SigV4. SMTP тут сознательно не используется:
// со статическим ключом SMTP-пароль надо выводить из секрета отдельным скриптом, а API — нет.
export class PostboxEmailSender implements EmailSender {
  private readonly client: SESv2Client;

  constructor(private readonly options: PostboxEmailSenderOptions) {
    this.client = new SESv2Client({
      endpoint: options.endpoint,
      region: options.region,
      credentials: { accessKeyId: options.keyId, secretAccessKey: options.secret },
    });
  }

  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    const result = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: formatFromAddress(this.options.from),
        Destination: { ToAddresses: [message.to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: message.text, Charset: 'UTF-8' },
              Html: { Data: message.html, Charset: 'UTF-8' },
            },
          },
        },
      })
    );

    return { providerMessageId: result.MessageId ?? '' };
  }
}
