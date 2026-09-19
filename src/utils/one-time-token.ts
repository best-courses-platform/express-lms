import crypto from 'crypto';

// Одноразовые токены из писем (подтверждение email, сброс пароля): в письме уходит сырой токен,
// в БД хранится только sha256 от него — тот же принцип, что у refresh-сессий. Если кто-то прочитает
// коллекцию users (бэкап, дамп, NoSQL-инъекция), из хеша нельзя получить рабочую ссылку.
// У токена 256 бит энтропии, поэтому достаточно обычного sha256 (bcrypt/argon2 здесь не нужны).
const TOKEN_BYTES = 32;

export function hashOneTimeToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateOneTimeToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  return { token, tokenHash: hashOneTimeToken(token) };
}
