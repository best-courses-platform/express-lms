import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { EmailService as EmailServiceClass } from '../email.service';
import type { EmailMessage } from '../email.sender';

// Unit-слой: транспорт подменяется fake-адаптером через конструктор (порт EmailSender), поэтому
// здесь проверяется только зона ответственности самого сервиса — шаблоны писем, вычисление
// text из html и обёртка ошибок транспорта. Поведение конкретных транспортов (SMTP/Postbox)
// проверяется в smtp-email.sender.unit.spec.ts / postbox-email.sender.unit.spec.ts, выбор
// драйвера — в email.sender-factory.unit.spec.ts.
const mockConfig = {
  email: { driver: 'smtp', port: 587, secure: false, from: 'noreply@example.com' },
  postbox: { region: 'ru-central1', endpoint: 'https://postbox.example.test' },
  frontendUrl: 'http://localhost:3001',
};

jest.mock('../../../config', () => ({ config: mockConfig }));

const { EmailService } = require('../email.service') as { EmailService: typeof EmailServiceClass };

const mockSend = jest.fn<(message: EmailMessage) => Promise<{ providerMessageId: string }>>();

function createConfiguredService(): EmailServiceClass {
  return new EmailService({ send: mockSend });
}

function createUnconfiguredService(): EmailServiceClass {
  return new EmailService(null);
}

describe('EmailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ providerMessageId: 'test-id' });
  });

  describe('isConfigured', () => {
    it('должен вернуть true, когда транспорт передан', () => {
      expect(createConfiguredService().isConfigured()).toBe(true);
    });

    it('должен вернуть false, когда транспорта нет (пустые креды выбранного драйвера)', () => {
      expect(createUnconfiguredService().isConfigured()).toBe(false);
    });
  });

  describe('Когда транспорт не настроен', () => {
    it('sendEmail должен тихо завершиться без вызова send', async () => {
      const service = createUnconfiguredService();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      await expect(service.sendEmail({ to: 'x@example.com', subject: 'Hi', html: '<p>Hi</p>' })).resolves.toBeUndefined();

      expect(mockSend).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('sendEmail', () => {
    it('должен передать транспорту to/subject/html', async () => {
      const service = createConfiguredService();

      await service.sendEmail({ to: 'user@example.com', subject: 'Subject', html: '<p>Body</p>' });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'user@example.com', subject: 'Subject', html: '<p>Body</p>' })
      );
    });

    it('должен вычислить text из html (без тегов), если text не передан явно', async () => {
      const service = createConfiguredService();

      await service.sendEmail({ to: 'user@example.com', subject: 'Subject', html: '<p>Hello <b>World</b></p>' });

      const [{ text }] = mockSend.mock.calls[0];
      expect(text).not.toMatch(/[<>]/);
      expect(text).toContain('Hello');
      expect(text).toContain('World');
    });

    it('должен использовать переданный text как есть, не пересчитывать из html', async () => {
      const service = createConfiguredService();

      await service.sendEmail({ to: 'user@example.com', subject: 'Subject', html: '<p>Hi</p>', text: 'plain text' });

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ text: 'plain text' }));
    });

    it('должен обернуть ошибку транспорта в AppError(500), не пробрасывая исходную ошибку как есть', async () => {
      const service = createConfiguredService();
      mockSend.mockRejectedValue(new Error('SMTP connection refused'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(
        service.sendEmail({ to: 'user@example.com', subject: 'Subject', html: '<p>Hi</p>' })
      ).rejects.toMatchObject({ status: 500 });

      errorSpy.mockRestore();
    });
  });

  describe('sendVerificationEmail', () => {
    it('должен отправить письмо со ссылкой подтверждения, построенной из frontendUrl и токена', async () => {
      const service = createConfiguredService();

      await service.sendVerificationEmail('user@example.com', 'verify-token-123', 'Имя');

      const [{ html, to }] = mockSend.mock.calls[0];
      expect(to).toBe('user@example.com');
      expect(html).toContain('http://localhost:3001/verify-email?token=verify-token-123');
      expect(html).toContain('Имя');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('должен отправить письмо со ссылкой сброса пароля, построенной из frontendUrl и токена', async () => {
      const service = createConfiguredService();

      await service.sendPasswordResetEmail('user@example.com', 'reset-token-456', 'Имя');

      const [{ html }] = mockSend.mock.calls[0];
      expect(html).toContain('http://localhost:3001/reset-password?token=reset-token-456');
    });
  });
});
