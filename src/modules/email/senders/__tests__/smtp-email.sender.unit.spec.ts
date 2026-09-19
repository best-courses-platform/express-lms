import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { SmtpEmailSender as SmtpEmailSenderClass } from '../smtp-email.sender';

const mockSendMail = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });
// По умолчанию null — как ведёт себя getTestMessageUrl() для любого не-Ethereal транспорта
// (реальный SMTP). Отдельный тест ниже переопределяет на непустую ссылку.
const mockGetTestMessageUrl = jest.fn().mockReturnValue(null);

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
  getTestMessageUrl: (...args: unknown[]) => mockGetTestMessageUrl(...args),
}));

const { SmtpEmailSender } = require('../smtp-email.sender') as { SmtpEmailSender: typeof SmtpEmailSenderClass };

const options = {
  host: 'smtp.test.com',
  port: 587,
  secure: false,
  auth: { user: 'bot@example.com', pass: 'secret-app-password' },
  from: 'noreply@example.com',
};

const message = { to: 'user@example.com', subject: 'Subject', html: '<p>Body</p>', text: 'Body' };

describe('SmtpEmailSender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: 'test-id' });
    mockGetTestMessageUrl.mockReturnValue(null);
  });

  it('должен создать transporter с host/port/secure/auth из опций', () => {
    new SmtpEmailSender(options);

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.test.com',
      port: 587,
      secure: false,
      auth: { user: 'bot@example.com', pass: 'secret-app-password' },
    });
  });

  it('должен отправить письмо с from, построенным из адреса отправителя, и вернуть messageId', async () => {
    const sender = new SmtpEmailSender(options);

    const result = await sender.send(message);

    expect(mockSendMail).toHaveBeenCalledWith({
      from: '"noreply" <noreply@example.com>',
      to: 'user@example.com',
      subject: 'Subject',
      html: '<p>Body</p>',
      text: 'Body',
    });
    expect(result).toEqual({ providerMessageId: 'test-id' });
  });

  it('должен пробросить ошибку SMTP как есть (обёртка в AppError — зона EmailService)', async () => {
    const sender = new SmtpEmailSender(options);
    mockSendMail.mockRejectedValue(new Error('SMTP connection refused'));

    await expect(sender.send(message)).rejects.toThrow('SMTP connection refused');
  });

  it('должен вывести Ethereal preview-ссылку в лог, когда getTestMessageUrl вернул её', async () => {
    const sender = new SmtpEmailSender(options);
    const sendMailResult = { messageId: 'test-id' };
    mockSendMail.mockResolvedValue(sendMailResult);
    mockGetTestMessageUrl.mockReturnValue('https://ethereal.email/message/abc123');
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await sender.send(message);

    expect(mockGetTestMessageUrl).toHaveBeenCalledWith(sendMailResult);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('https://ethereal.email/message/abc123'));
    consoleLogSpy.mockRestore();
  });

  it('не должен ничего логировать, когда getTestMessageUrl вернул null (реальный SMTP-транспорт)', async () => {
    const sender = new SmtpEmailSender(options);
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await sender.send(message);

    expect(consoleLogSpy).not.toHaveBeenCalled();
    consoleLogSpy.mockRestore();
  });
});
