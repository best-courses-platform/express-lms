import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PostboxEmailSender as PostboxEmailSenderClass } from '../postbox-email.sender';

// Сетевой клиент SES подменён целиком: проверяется, что адаптер строит правильный запрос
// (endpoint/region/креды клиента и содержимое SendEmailCommand) и достаёт MessageId из ответа.
const mockClientSend = jest.fn<(command: unknown) => Promise<{ MessageId?: string }>>();
const mockClientCtor = jest.fn();

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation((...args: unknown[]) => {
    mockClientCtor(...args);
    return { send: (command: unknown) => mockClientSend(command) };
  }),
  SendEmailCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

const { PostboxEmailSender } = require('../postbox-email.sender') as { PostboxEmailSender: typeof PostboxEmailSenderClass };

const options = {
  keyId: 'YCAJ-test-key-id',
  secret: 'YCM-test-secret',
  region: 'ru-central1',
  endpoint: 'https://postbox.cloud.yandex.net',
  from: 'noreply@best-courses-ever.ru',
};

const message = { to: 'user@example.com', subject: 'Тема', html: '<p>Тело</p>', text: 'Тело' };

describe('PostboxEmailSender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientSend.mockResolvedValue({ MessageId: 'msg-123' });
  });

  it('должен создать SES-клиент с endpoint, регионом и статическим ключом из опций', () => {
    new PostboxEmailSender(options);

    expect(mockClientCtor).toHaveBeenCalledWith({
      endpoint: 'https://postbox.cloud.yandex.net',
      region: 'ru-central1',
      credentials: { accessKeyId: 'YCAJ-test-key-id', secretAccessKey: 'YCM-test-secret' },
    });
  });

  it('должен отправить письмо с from, to, темой и html/text в UTF-8 и вернуть MessageId', async () => {
    const sender = new PostboxEmailSender(options);

    const result = await sender.send(message);

    const [command] = mockClientSend.mock.calls[0] as [{ input: unknown }];
    expect(command.input).toEqual({
      FromEmailAddress: '"noreply" <noreply@best-courses-ever.ru>',
      Destination: { ToAddresses: ['user@example.com'] },
      Content: {
        Simple: {
          Subject: { Data: 'Тема', Charset: 'UTF-8' },
          Body: {
            Text: { Data: 'Тело', Charset: 'UTF-8' },
            Html: { Data: '<p>Тело</p>', Charset: 'UTF-8' },
          },
        },
      },
    });
    expect(result).toEqual({ providerMessageId: 'msg-123' });
  });

  it('должен вернуть пустой providerMessageId, если ответ без MessageId', async () => {
    const sender = new PostboxEmailSender(options);
    mockClientSend.mockResolvedValue({});

    await expect(sender.send(message)).resolves.toEqual({ providerMessageId: '' });
  });

  it('должен пробросить ошибку API как есть (обёртка в AppError — зона EmailService)', async () => {
    const sender = new PostboxEmailSender(options);
    mockClientSend.mockRejectedValue(new Error('Forbidden'));

    await expect(sender.send(message)).rejects.toThrow('Forbidden');
  });
});
