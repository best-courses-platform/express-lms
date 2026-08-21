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

export async function enqueueVerificationEmail(email: string, token: string, name?: string): Promise<void> {
  if (!emailQueue) {
    await emailService.sendVerificationEmail(email, token, name);
    return;
  }
  await emailQueue.add('verification', { type: 'verification', email, token, name }, DEFAULT_JOB_OPTIONS);
}

export async function enqueuePasswordResetEmail(email: string, token: string, name?: string): Promise<void> {
  if (!emailQueue) {
    await emailService.sendPasswordResetEmail(email, token, name);
    return;
  }
  await emailQueue.add('password-reset', { type: 'password-reset', email, token, name }, DEFAULT_JOB_OPTIONS);
}
