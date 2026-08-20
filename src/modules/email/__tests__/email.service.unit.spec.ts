import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { EmailService as EmailServiceClass } from '../email.service';

// Unit-слой: nodemailer и config замокан — впервые проверяется ветка "email реально
// настроен" (config.email.auth.user/pass заданы). Раньше — во всех auth-тестах (unit и
// integration) — EMAIL_USER/EMAIL_PASSWORD всегда пустые (см. test/setupTestEnv.ts), поэтому
// emailService.isConfigured() всегда false, а реальный transporter.sendMail() не вызывался
// вообще ни разу за всю сессию: и содержимое писем, и обработка ошибок SMTP оставались
// полностью непроверенными.
//
// config.email.auth — обычный мутируемый объект (не функция вроде isSelectelConfigured()),
// поэтому per-test конфигурация делается прямой мутацией mockConfig перед `new EmailService()`
// (конструктор читает auth.user/pass один раз при создании инстанса) — без jest.resetModules().
const mockConfig = {
  email: {
    host: 'smtp.test.com',
    port: 587,
    secure: false,
    auth: { user: 'bot@example.com', pass: 'secret-app-password' },
    from: 'noreply@example.com',
  },
  frontendUrl: 'http://localhost:3001',
};

const mockSendMail = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock('../../../config', () => ({ config: mockConfig }));
jest.mock('nodemailer', () => ({ createTransport: (...args: unknown[]) => mockCreateTransport(...args) }));

/* eslint-disable @typescript-eslint/no-var-requires */
const { EmailService } = require('../email.service') as { EmailService: typeof EmailServiceClass };
/* eslint-enable @typescript-eslint/no-var-requires */

function createConfiguredService(): EmailServiceClass {
  mockConfig.email.auth = { user: 'bot@example.com', pass: 'secret-app-password' };
  return new EmailService();
}

function createUnconfiguredService(): EmailServiceClass {
  mockConfig.email.auth = { user: '', pass: '' };
  return new EmailService();
}

describe('EmailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockResolvedValue(undefined);
  });

  describe('isConfigured', () => {
    it('должен вернуть true, когда auth.user и auth.pass заданы', () => {
      const service = createConfiguredService();
      expect(service.isConfigured()).toBe(true);
    });

    it('должен вернуть false и не создавать transporter, когда auth пуст', () => {
      const service = createUnconfiguredService();

      expect(service.isConfigured()).toBe(false);
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });
  });

  describe('Когда email не настроен', () => {
    it('sendEmail должен тихо завершиться без вызова sendMail', async () => {
      const service = createUnconfiguredService();

      await expect(service.sendEmail({ to: 'x@example.com', subject: 'Hi', html: '<p>Hi</p>' })).resolves.toBeUndefined();
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('Когда email настроен', () => {
    it('должен создать transporter с host/port/secure/auth из конфига', () => {
      createConfiguredService();

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.test.com',
          port: 587,
          secure: false,
          auth: { user: 'bot@example.com', pass: 'secret-app-password' },
        })
      );
    });

    describe('sendEmail', () => {
      it('должен отправить письмо с указанными to/subject/html и from, построенным из config.email.from', async () => {
        const service = createConfiguredService();

        await service.sendEmail({ to: 'user@example.com', subject: 'Subject', html: '<p>Body</p>' });

        expect(mockSendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            from: '"noreply" <noreply@example.com>',
            to: 'user@example.com',
            subject: 'Subject',
            html: '<p>Body</p>',
          })
        );
      });

      it('должен вычислить text из html (без тегов), если text не передан явно', async () => {
        const service = createConfiguredService();

        await service.sendEmail({ to: 'user@example.com', subject: 'Subject', html: '<p>Hello <b>World</b></p>' });

        const [{ text }] = mockSendMail.mock.calls[0] as [{ text: string }];
        expect(text).not.toMatch(/[<>]/);
        expect(text).toContain('Hello');
        expect(text).toContain('World');
      });

      it('должен использовать переданный text как есть, не пересчитывать из html', async () => {
        const service = createConfiguredService();

        await service.sendEmail({ to: 'user@example.com', subject: 'Subject', html: '<p>Hi</p>', text: 'plain text' });

        expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ text: 'plain text' }));
      });

      it('должен обернуть ошибку SMTP в AppError(500), не пробрасывая исходную ошибку как есть', async () => {
        const service = createConfiguredService();
        mockSendMail.mockRejectedValue(new Error('SMTP connection refused'));

        await expect(
          service.sendEmail({ to: 'user@example.com', subject: 'Subject', html: '<p>Hi</p>' })
        ).rejects.toMatchObject({ status: 500 });
      });
    });

    describe('sendVerificationEmail', () => {
      it('должен отправить письмо со ссылкой подтверждения, построенной из frontendUrl и токена', async () => {
        const service = createConfiguredService();

        await service.sendVerificationEmail('user@example.com', 'verify-token-123', 'Имя');

        const [{ html, to }] = mockSendMail.mock.calls[0] as [{ html: string; to: string }];
        expect(to).toBe('user@example.com');
        expect(html).toContain('http://localhost:3001/verify-email?token=verify-token-123');
        expect(html).toContain('Имя');
      });
    });

    describe('sendPasswordResetEmail', () => {
      it('должен отправить письмо со ссылкой сброса пароля, построенной из frontendUrl и токена', async () => {
        const service = createConfiguredService();

        await service.sendPasswordResetEmail('user@example.com', 'reset-token-456', 'Имя');

        const [{ html }] = mockSendMail.mock.calls[0] as [{ html: string }];
        expect(html).toContain('http://localhost:3001/reset-password?token=reset-token-456');
      });
    });
  });
});
