import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { EmailMessage, EmailSender } from '../email.sender';
import { SuppressionAwareEmailSender } from '../suppression-aware-email.sender';

const message: EmailMessage = { to: 'user@example.com', subject: 'S', html: '<p>h</p>', text: 't' };

describe('SuppressionAwareEmailSender', () => {
  const innerSend = jest.fn<EmailSender['send']>();
  const isSuppressed = jest.fn<(email: string) => Promise<boolean>>();
  const sender = new SuppressionAwareEmailSender({ send: innerSend }, { isSuppressed });

  beforeEach(() => {
    jest.clearAllMocks();
    innerSend.mockResolvedValue({ providerMessageId: 'real-id' });
  });

  it('должен передать письмо транспорту, если адреса нет в списке подавления', async () => {
    isSuppressed.mockResolvedValue(false);

    const result = await sender.send(message);

    expect(isSuppressed).toHaveBeenCalledWith('user@example.com');
    expect(innerSend).toHaveBeenCalledWith(message);
    expect(result).toEqual({ providerMessageId: 'real-id' });
  });

  it('не должен вызывать транспорт для адреса из списка подавления и не должен падать', async () => {
    isSuppressed.mockResolvedValue(true);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await sender.send(message);

    expect(innerSend).not.toHaveBeenCalled();
    expect(result).toEqual({ providerMessageId: 'suppressed' });
    warnSpy.mockRestore();
  });

  it('должен пробросить ошибку проверки, а не отправлять письмо вслепую (очередь ретраит)', async () => {
    isSuppressed.mockRejectedValue(new Error('mongo down'));

    await expect(sender.send(message)).rejects.toThrow('mongo down');
    expect(innerSend).not.toHaveBeenCalled();
  });
});
