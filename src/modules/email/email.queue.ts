import { createHash } from 'crypto';
import { Queue } from 'bullmq';
import { config } from '../../config';
import { emailService } from './email.service';

const isTestEnv = process.env.NODE_ENV === 'test';

const connection = { host: config.redis.host, port: config.redis.port };

export type EmailJobData =
  | { type: 'verification'; email: string; token: string; name?: string }
  | { type: 'password-reset'; email: string; token: string; name?: string };

// В тестах не создаём реальное соединение с Redis — сам конструктор Queue/ioredis
// подключается сразу при инстанцировании, не только при .add(). Тот же принцип, что
// у isTestEnv в middleware/rate-limit.ts: поднимать Redis только ради jest-прогона,
// который проверяет совсем другую логику (auth), не имеет смысла.
export const emailQueue = isTestEnv ? null : new Queue<EmailJobData>('email', { connection });

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
};

// Стабильный идентификатор задачи: BullMQ не добавит вторую задачу с тем же jobId, пока первая есть в
// Redis, — повторная постановка того же письма (ретрай запроса, двойной клик, повтор после сбоя между
// записью в БД и очередью) не отправит его дважды. Идентификатор — хеш от адреса и токена: токен
// выдаётся заново на каждую отправку (в том числе повторную), поэтому осознанная повторная отправка
// получает другой jobId и не блокируется, а сырой токен не попадает в ключ Redis. Дефис, не двоеточие:
// BullMQ запрещает двоеточие в пользовательских идентификаторах.
export function emailJobId(type: EmailJobData['type'], email: string, token: string): string {
  const digest = createHash('sha256').update(`${email.trim().toLowerCase()}\n${token}`).digest('hex');
  return `${type}-${digest}`;
}

export async function enqueueVerificationEmail(email: string, token: string, name?: string): Promise<void> {
  if (!emailQueue) {
    await emailService.sendVerificationEmail(email, token, name);
    return;
  }
  await emailQueue.add(
    'verification',
    { type: 'verification', email, token, name },
    { ...DEFAULT_JOB_OPTIONS, jobId: emailJobId('verification', email, token) }
  );
}

export async function enqueuePasswordResetEmail(email: string, token: string, name?: string): Promise<void> {
  if (!emailQueue) {
    await emailService.sendPasswordResetEmail(email, token, name);
    return;
  }
  await emailQueue.add(
    'password-reset',
    { type: 'password-reset', email, token, name },
    { ...DEFAULT_JOB_OPTIONS, jobId: emailJobId('password-reset', email, token) }
  );
}
