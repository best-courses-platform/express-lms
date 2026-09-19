import { Worker } from 'bullmq';
import { config } from '../../config';
import { emailService } from './email.service';
import { EmailJobData } from './email.queue';

const connection = { host: config.redis.host, port: config.redis.port };

let emailWorker: Worker<EmailJobData> | null = null;

// Запускается явно из server.ts (не при импорте модуля). Раньше Worker создавался на импорте, а модуль
// попадал в каждый процесс транзитивно (app.ts → shutdown.ts → email.worker.ts), поэтому воркер
// стартовал везде, включая API-поды и тесты. Явный запуск позволяет разделить роли: один образ,
// а API, воркер и потребитель событий различаются только переменными окружения
// (EMAIL_WORKER_ENABLED, POSTBOX_EVENTS_*).
export function startEmailWorker(): boolean {
  if (emailWorker || !config.email.worker.enabled) {
    return false;
  }
  const { ratePerSecond } = config.email.worker;

  emailWorker = new Worker<EmailJobData>(
    'email',
    async job => {
      if (job.data.type === 'verification') {
        await emailService.sendVerificationEmail(job.data.email, job.data.token, job.data.name);
      } else {
        await emailService.sendPasswordResetEmail(job.data.email, job.data.token, job.data.name);
      }
    },
    { connection, ...(ratePerSecond ? { limiter: { max: ratePerSecond, duration: 1000 } } : {}) }
  );

  emailWorker.on('failed', (job, error) => {
    console.error(`Задача отправки email ${job?.id} провалилась (попытка ${job?.attemptsMade}/3):`, error.message);
  });

  console.log('Email worker: запущен');
  return true;
}

// Безопасно вызывать и когда воркер не запускался — для graceful shutdown.
export async function closeEmailWorker(): Promise<void> {
  await emailWorker?.close();
  emailWorker = null;
}
