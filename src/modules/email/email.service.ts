import { config } from '../../config';
import { InternalError } from '../../utils/errors';
import { EMAIL_MESSAGES } from './email.constants';
import { EmailSender } from './email.sender';
import { createEmailSender } from './email.sender-factory';
import { suppressionService } from './suppression/suppression.service';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Шаблоны писем + единая обработка ошибок. Сам транспорт (SMTP для dev, Postbox для прода)
// приходит извне через порт EmailSender; null — транспорт не настроен, письма не отправляются.
export class EmailService {
  constructor(private readonly sender: EmailSender | null = createEmailSender(config, suppressionService)) {}

  async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.sender) {
      console.warn('Email sender not configured. Email not sent.');
      return;
    }

    try {
      await this.sender.send({
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
      });
    } catch (error) {
      console.error('Email sending error:', error);
      throw new InternalError(EMAIL_MESSAGES.ERROR.SEND_FAILED, error);
    }
  }

  async sendVerificationEmail(email: string, token: string, name?: string): Promise<void> {
    const verificationLink = `${config.frontendUrl}/verify-email?token=${token}`;

    await this.sendEmail({
      to: email,
      subject: 'Подтверждение регистрации',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Добро пожаловать в Best Courses Ever!</h2>
          <p>Привет${name ? `, ${name}` : ''}!</p>
          <p>Спасибо за регистрацию. Для завершения регистрации подтвердите ваш email:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}"
               style="background-color: #4CAF50; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Подтвердить Email
            </a>
          </div>
          <p>Или скопируйте ссылку:</p>
          <p style="background-color: #f5f5f5; padding: 10px; border-radius: 5px;
                    word-break: break-all;">
            ${verificationLink}
          </p>
          <p>Ссылка действительна 24 часа.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">
            Если вы не регистрировались на нашем сайте, просто проигнорируйте это письмо.
          </p>
        </div>
      `,
    });
  }

  async sendPasswordResetEmail(email: string, token: string, name?: string): Promise<void> {
    const resetLink = `${config.frontendUrl}/reset-password?token=${token}`;

    await this.sendEmail({
      to: email,
      subject: 'Восстановление пароля',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Восстановление пароля</h2>
          <p>Привет${name ? `, ${name}` : ''}!</p>
          <p>Мы получили запрос на восстановление пароля для вашего аккаунта.</p>
          <p>Для сброса пароля нажмите на кнопку ниже:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}"
               style="background-color: #2196F3; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Сбросить пароль
            </a>
          </div>
          <p>Или скопируйте ссылку:</p>
          <p style="background-color: #f5f5f5; padding: 10px; border-radius: 5px;
                    word-break: break-all;">
            ${resetLink}
          </p>
          <p><strong>Внимание:</strong> Ссылка действительна 1 час.</p>
          <p>Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">
            По вопросам безопасности обращайтесь в службу поддержки.
          </p>
        </div>
      `,
    });
  }

  isConfigured(): boolean {
    return this.sender !== null;
  }
}

export const emailService = new EmailService();
