import { describe, it, expect } from '@jest/globals';
import type { Config } from '../../../config/schema';
import { createEmailSender } from '../email.sender-factory';
import { PostboxEmailSender } from '../senders/postbox-email.sender';
import { SmtpEmailSender } from '../senders/smtp-email.sender';
import { SuppressionAwareEmailSender } from '../suppression/suppression-aware-email.sender';

type SenderConfig = Pick<Config, 'email' | 'postbox'>;

function buildConfig(overrides: { email?: Partial<Config['email']>; postbox?: Partial<Config['postbox']> } = {}): SenderConfig {
  return {
    email: {
      driver: 'smtp',
      host: 'smtp.test.com',
      port: 587,
      secure: false,
      auth: { user: 'bot@example.com', pass: 'secret' },
      from: 'noreply@example.com',
      verificationUrl: 'http://localhost:3000/api/auth/verify-email',
      worker: { enabled: true },
      ...overrides.email,
    },
    postbox: {
      keyId: 'key-id',
      secret: 'secret',
      region: 'ru-central1',
      endpoint: 'https://postbox.cloud.yandex.net',
      from: 'noreply@best-courses-ever.ru',
      events: { pollIntervalMs: 5000 },
      ...overrides.postbox,
    },
  };
}

describe('createEmailSender', () => {
  describe('драйвер smtp', () => {
    it('должен вернуть SmtpEmailSender, когда заданы user и pass', () => {
      expect(createEmailSender(buildConfig())).toBeInstanceOf(SmtpEmailSender);
    });

    it('должен вернуть null, когда auth пуст (транспорт не настроен)', () => {
      expect(createEmailSender(buildConfig({ email: { auth: { user: '', pass: '' } } }))).toBeNull();
    });

    it('должен вернуть null, когда auth не задан вовсе', () => {
      expect(createEmailSender(buildConfig({ email: { auth: undefined } }))).toBeNull();
    });

    it('не должен смотреть на ключи Postbox — они игнорируются при драйвере smtp', () => {
      const sender = createEmailSender(buildConfig({ postbox: { keyId: '', secret: '' } }));

      expect(sender).toBeInstanceOf(SmtpEmailSender);
    });
  });

  describe('драйвер postbox', () => {
    it('должен вернуть PostboxEmailSender, когда заданы keyId, secret и from', () => {
      expect(createEmailSender(buildConfig({ email: { driver: 'postbox' } }))).toBeInstanceOf(PostboxEmailSender);
    });

    it.each([
      ['keyId', { keyId: '' }],
      ['secret', { secret: '' }],
      ['from', { from: undefined }],
    ])('должен вернуть null, когда не задан %s', (_name, postbox) => {
      expect(createEmailSender(buildConfig({ email: { driver: 'postbox' }, postbox }))).toBeNull();
    });

    it('не должен смотреть на SMTP-креды — они игнорируются при драйвере postbox', () => {
      const sender = createEmailSender(buildConfig({ email: { driver: 'postbox', auth: { user: '', pass: '' } } }));

      expect(sender).toBeInstanceOf(PostboxEmailSender);
    });
  });

  describe('список подавления', () => {
    const suppression = { isSuppressed: async () => false };

    it('должен обернуть настроенный транспорт проверкой списка подавления', () => {
      expect(createEmailSender(buildConfig(), suppression)).toBeInstanceOf(SuppressionAwareEmailSender);
      expect(createEmailSender(buildConfig({ email: { driver: 'postbox' } }), suppression)).toBeInstanceOf(
        SuppressionAwareEmailSender
      );
    });

    it('не должен оборачивать, если проверка не передана', () => {
      expect(createEmailSender(buildConfig())).toBeInstanceOf(SmtpEmailSender);
    });

    it('должен вернуть null, если транспорт не настроен, даже когда проверка передана', () => {
      expect(createEmailSender(buildConfig({ email: { auth: undefined } }), suppression)).toBeNull();
    });
  });
});
