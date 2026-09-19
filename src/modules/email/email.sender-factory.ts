import type { Config } from '../../config/schema';
import { EmailSender } from './email.sender';
import { PostboxEmailSender } from './senders/postbox-email.sender';
import { SmtpEmailSender } from './senders/smtp-email.sender';
import { SuppressionAwareEmailSender, SuppressionChecker } from './suppression/suppression-aware-email.sender';

// null — транспорт не настроен (пустые креды выбранного драйвера): EmailService в этом случае
// тихо не отправляет письма, как и раньше при пустых EMAIL_USER/EMAIL_PASSWORD.
// Если передан suppression, транспорт оборачивается проверкой списка подавления: адреса с
// постоянным отказом или жалобой пропускаются ещё до провайдера.
export function createEmailSender(
  config: Pick<Config, 'email' | 'postbox'>,
  suppression?: SuppressionChecker
): EmailSender | null {
  const inner = createTransportSender(config);
  if (!inner || !suppression) {
    return inner;
  }
  return new SuppressionAwareEmailSender(inner, suppression);
}

function createTransportSender(config: Pick<Config, 'email' | 'postbox'>): EmailSender | null {
  if (config.email.driver === 'postbox') {
    const { keyId, secret, region, endpoint, from } = config.postbox;
    if (!keyId || !secret || !from) {
      return null;
    }
    return new PostboxEmailSender({ keyId, secret, region, endpoint, from });
  }

  const { host, port, secure, auth, from } = config.email;
  if (!auth?.user || !auth?.pass) {
    return null;
  }
  return new SmtpEmailSender({
    host: host || 'smtp.gmail.com',
    port,
    secure,
    auth: { user: auth.user, pass: auth.pass },
    from,
  });
}
