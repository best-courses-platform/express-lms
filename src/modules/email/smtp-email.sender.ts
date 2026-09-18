import nodemailer from 'nodemailer';
import { EmailMessage, EmailSender, formatFromAddress } from './email.sender';

export interface SmtpEmailSenderOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  from: string;
}

// Dev-адаптер (Ethereal/Mailpit/любой SMTP). Для прода используется PostboxEmailSender.
export class SmtpEmailSender implements EmailSender {
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly options: SmtpEmailSenderOptions) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: options.auth,
    });
  }

  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    const info = await this.transporter.sendMail({
      from: formatFromAddress(this.options.from),
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    // Ethereal не доставляет письма реально — preview-ссылка единственный способ увидеть
    // содержимое. getTestMessageUrl() возвращает null для любого другого транспорта
    // (реальный SMTP), так что в проде это просто no-op.
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`📧 Ethereal preview: ${previewUrl}`);
    }

    return { providerMessageId: info.messageId };
  }
}
