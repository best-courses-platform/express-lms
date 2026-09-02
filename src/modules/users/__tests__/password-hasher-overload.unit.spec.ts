import { describe, it, expect, jest } from '@jest/globals';
import { ServiceUnavailableError } from '../../../utils/errors';

// password-hasher.ts даёт переполнению очереди Piscina (maxQueue, см. её errors.ts —
// ошибка с текстом ровно 'Task queue is at limit') понятный статус для клиента: 503,
// а не растущую до минут задержку и не проглоченный где-то по пути 500. Реальный пул
// размером с CPU-ядра этой машины детерминированно не переполнить в юнит-тесте — мокаем
// сам Piscina целиком, чтобы pool.run() гарантированно бросал именно эту ошибку. Тот же
// приём, что и email.queue.unit.spec.ts использует для bullmq (require() после jest.mock(),
// не import — @swc/jest не хойстит jest.mock() выше import-ов, см. комментарий там же).
//
// piscina — `export =` (CJS module.exports = класс), не именованный экспорт, как bullmq —
// поэтому фабрика мока возвращает сам jest.fn()-конструктор, а не объект с полем.
const runMock = jest.fn<() => Promise<unknown>>();

jest.mock('piscina', () =>
  jest.fn().mockImplementation(() => ({
    run: runMock,
    destroy: jest.fn(),
  }))
);

const { hashPassword, comparePassword } = require('../password-hasher') as typeof import('../password-hasher');

describe('password-hasher — переполнение очереди piscina', () => {
  it('hashPassword бросает ServiceUnavailableError (503) вместо сырой ошибки Piscina', async () => {
    runMock.mockRejectedValueOnce(new Error('Task queue is at limit'));

    await expect(hashPassword('password123')).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('comparePassword тоже бросает ServiceUnavailableError (503) при переполнении', async () => {
    runMock.mockRejectedValueOnce(new Error('Task queue is at limit'));

    await expect(comparePassword('password123', 'somehash')).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('не перехватывает и не маскирует другие ошибки пула — они долетают как есть', async () => {
    runMock.mockRejectedValueOnce(new Error('Terminating worker thread'));

    // Одна и та же попытка вызова проверяется дважды (на текст сообщения и на то, что это
    // НЕ ServiceUnavailableError) — два отдельных hashPassword() потребовали бы два
    // mockRejectedValueOnce подряд и рисковали бы молча разойтись друг с другом.
    const attempt = hashPassword('password123');

    await expect(attempt).rejects.toThrow('Terminating worker thread');
    await expect(attempt).rejects.not.toBeInstanceOf(ServiceUnavailableError);
  });
});
