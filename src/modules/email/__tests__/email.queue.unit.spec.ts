import { describe, it, expect, jest } from '@jest/globals';

// email.queue.ts решает, создавать ли реальную BullMQ-очередь, по process.env.NODE_ENV в
// момент импорта (isTestEnv). Jest всегда выставляет NODE_ENV=test (см. test/setupTestEnv.ts),
// поэтому обычный import/require этого модуля в любом другом тесте всегда попадает в
// test-bypass ветку (emailQueue === null) — реальная ветка через BullMQ иначе никогда не
// исполняется ни одним тестом. Здесь намеренно эмулируем "не тестовое" окружение и мокаем
// bullmq целиком (не поднимаем настоящий Redis), чтобы проверить именно эту ветку.
//
// @swc/jest не хойстит jest.mock() выше import — require() после jest.mock() обязателен.
const addMock = jest.fn((_name: string, _data: unknown, _opts: unknown) => Promise.resolve());

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: addMock })),
}));

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';

const emailQueueModule = require('../email.queue') as typeof import('../email.queue');

process.env.NODE_ENV = originalNodeEnv;

const { enqueueVerificationEmail, enqueuePasswordResetEmail, emailQueue, emailJobId } = emailQueueModule;

describe('email.queue — реальная ветка через BullMQ (Redis "настроен")', () => {
  it('создаёт очередь (не null), когда NODE_ENV не test', () => {
    expect(emailQueue).not.toBeNull();
  });

  it('enqueueVerificationEmail кладёт задачу в очередь с retry-опциями, не шлёт письмо напрямую', async () => {
    await enqueueVerificationEmail('a@b.com', 'token123', 'Имя');

    expect(addMock).toHaveBeenCalledWith(
      'verification',
      { type: 'verification', email: 'a@b.com', token: 'token123', name: 'Имя' },
      expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 2000 } })
    );
  });

  it('enqueuePasswordResetEmail кладёт задачу с типом password-reset', async () => {
    await enqueuePasswordResetEmail('c@d.com', 'token456');

    expect(addMock).toHaveBeenCalledWith(
      'password-reset',
      { type: 'password-reset', email: 'c@d.com', token: 'token456', name: undefined },
      expect.objectContaining({ attempts: 3 })
    );
  });

  describe('идемпотентность задач (jobId)', () => {
    it('одно и то же письмо получает один и тот же jobId — повторная постановка не создаст дубль', async () => {
      addMock.mockClear();

      await enqueueVerificationEmail('a@b.com', 'tok', 'Имя');
      await enqueueVerificationEmail('a@b.com', 'tok', 'Имя');

      const ids = addMock.mock.calls.map(call => (call[2] as { jobId: string }).jobId);
      expect(ids[0]).toBe(ids[1]);
      expect(ids[0]).toBe(emailJobId('verification', 'a@b.com', 'tok'));
    });

    it('новый токен (осознанная повторная отправка) даёт другой jobId и не блокируется', () => {
      expect(emailJobId('verification', 'a@b.com', 'tok-1')).not.toBe(emailJobId('verification', 'a@b.com', 'tok-2'));
    });

    it('разные типы писем с одним токеном не сливаются', () => {
      expect(emailJobId('verification', 'a@b.com', 'tok')).not.toBe(emailJobId('password-reset', 'a@b.com', 'tok'));
    });

    it('регистр и пробелы в адресе не влияют на jobId', () => {
      expect(emailJobId('verification', '  A@B.com ', 'tok')).toBe(emailJobId('verification', 'a@b.com', 'tok'));
    });

    it('jobId не содержит двоеточия (BullMQ запрещает) и сырого токена', () => {
      const id = emailJobId('password-reset', 'a@b.com', 'super-secret-token');

      expect(id).not.toContain(':');
      expect(id).not.toContain('super-secret-token');
      expect(id).toMatch(/^password-reset-[0-9a-f]{64}$/);
    });
  });
});
