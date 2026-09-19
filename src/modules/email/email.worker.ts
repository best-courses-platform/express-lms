import { Worker } from 'bullmq';
import { config } from '../../config';
import { emailService } from './email.service';
import { EmailJobData } from './email.queue';

const isTestEnv = process.env.NODE_ENV === 'test';

const connection = { host: config.redis.host, port: config.redis.port };

// Модуль попадает в тесты транзитивно: app.ts → shutdown.ts → email.worker.ts (closeEmailWorker),
// поэтому создание Worker на импорте подключалось бы к Redis в каждом тесте, бьющем по app, и
// засоряло вывод тысячами ECONNREFUSED. Тот же принцип, что у emailQueue (email.queue.ts): в
// тестах очередь не нужна — письма отправляются напрямую.
export const emailWorker = isTestEnv
  ? null
  : new Worker<EmailJobData>(
      'email',
      async job => {
        if (job.data.type === 'verification') {
          await emailService.sendVerificationEmail(job.data.email, job.data.token, job.data.name);
        } else {
          await emailService.sendPasswordResetEmail(job.data.email, job.data.token, job.data.name);
        }
      },
      { connection }
    );

emailWorker?.on('failed', (job, error) => {
  console.error(`Задача отправки email ${job?.id} провалилась (попытка ${job?.attemptsMade}/3):`, error.message);
});

export async function closeEmailWorker(): Promise<void> {
  await emailWorker?.close();
}
