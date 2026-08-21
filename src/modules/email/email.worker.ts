import { Worker } from 'bullmq';
import { config } from '../../config';
import { emailService } from './email.service';
import { EmailJobData } from './email.queue';

const connection = { host: config.redis.host, port: config.redis.port };

// Импортируется только из server.ts (не из app.ts) — тесты бьют по app напрямую через
// supertest и не должны поднимать реальное соединение с Redis, см. email.queue.ts.
export const emailWorker = new Worker<EmailJobData>(
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

emailWorker.on('failed', (job, error) => {
  console.error(`Задача отправки email ${job?.id} провалилась (попытка ${job?.attemptsMade}/3):`, error.message);
});

export async function closeEmailWorker(): Promise<void> {
  await emailWorker.close();
}
