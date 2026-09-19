import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Воркер создаётся явно (startEmailWorker), а не при импорте модуля — иначе он стартовал бы в каждом
// процессе, куда модуль попадает транзитивно (API-под, тесты). Bullmq мокается целиком: настоящего
// Redis здесь нет. @swc/jest не хойстит jest.mock() выше import — require() после jest.mock().
const closeMock = jest.fn(async () => undefined);
const onMock = jest.fn();
const WorkerCtor = jest.fn().mockImplementation(() => ({ close: closeMock, on: onMock }));

jest.mock('bullmq', () => ({ Worker: WorkerCtor }));

const mockConfig: { redis: { host: string; port: number }; email: { worker: { enabled: boolean; ratePerSecond?: number } } } = {
  redis: { host: 'localhost', port: 6379 },
  email: { worker: { enabled: true } },
};
jest.mock('../../../config', () => ({ config: mockConfig }));
jest.mock('../email.service', () => ({ emailService: {} }));

type WorkerModule = typeof import('../email.worker');
let workerModule: WorkerModule;

describe('email.worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockConfig.email.worker.enabled = true;
    mockConfig.email.worker.ratePerSecond = undefined;
    // Состояние воркера — переменная модуля: чистый модуль в каждом тесте
    jest.resetModules();
    workerModule = require('../email.worker');
  });

  it('не создаёт Worker при импорте модуля', () => {
    expect(WorkerCtor).not.toHaveBeenCalled();
  });

  it('startEmailWorker создаёт Worker очереди "email" с подключением к Redis', () => {
    expect(workerModule.startEmailWorker()).toBe(true);

    expect(WorkerCtor).toHaveBeenCalledTimes(1);
    expect(WorkerCtor).toHaveBeenCalledWith('email', expect.any(Function), {
      connection: { host: 'localhost', port: 6379 },
    });
  });

  it('без ограничения скорости limiter не передаётся', () => {
    workerModule.startEmailWorker();

    expect(WorkerCtor.mock.calls[0][2]).not.toHaveProperty('limiter');
  });

  it('с EMAIL_WORKER_RATE_PER_SEC воркер ограничен N задачами в секунду', () => {
    mockConfig.email.worker.ratePerSecond = 5;

    workerModule.startEmailWorker();

    expect(WorkerCtor.mock.calls[0][2]).toMatchObject({ limiter: { max: 5, duration: 1000 } });
  });

  it('при EMAIL_WORKER_ENABLED=false воркер не запускается', () => {
    mockConfig.email.worker.enabled = false;

    expect(workerModule.startEmailWorker()).toBe(false);
    expect(WorkerCtor).not.toHaveBeenCalled();
  });

  it('повторный вызов не создаёт второй Worker', () => {
    workerModule.startEmailWorker();

    expect(workerModule.startEmailWorker()).toBe(false);
    expect(WorkerCtor).toHaveBeenCalledTimes(1);
  });

  it('closeEmailWorker закрывает запущенный воркер и безопасен, когда воркер не запускался', async () => {
    await expect(workerModule.closeEmailWorker()).resolves.toBeUndefined();
    expect(closeMock).not.toHaveBeenCalled();

    workerModule.startEmailWorker();
    await workerModule.closeEmailWorker();

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('после закрытия воркер можно запустить снова', async () => {
    workerModule.startEmailWorker();
    await workerModule.closeEmailWorker();

    expect(workerModule.startEmailWorker()).toBe(true);
    expect(WorkerCtor).toHaveBeenCalledTimes(2);
  });
});
