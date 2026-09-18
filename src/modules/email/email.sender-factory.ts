import type { Config } from '../../config/schema';
import { EmailSender } from './email.sender';
import { PostboxEmailSender } from './postbox-email.sender';
import { SmtpEmailSender } from './smtp-email.sender';

// null — транспорт не настроен (пустые креды выбранного драйвера): EmailService в этом случае
// тихо не отправляет письма, как и раньше при пустых EMAIL_USER/EMAIL_PASSWORD.
export function createEmailSender(config: Pick<Config, 'email' | 'postbox'>): EmailSender | null {
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
