import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Server } from 'http';

// process.exit() реально завершил бы тестовый воркер — обязательно мокать до всего
// остального, иначе первый же успешный shutdown() убьёт jest-процесс. Кастуем как never,
// потому что реальная сигнатура возвращает `never` — jest.fn() этого не знает сама.
const exitMock = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

const closeEmailWorkerMock = jest.fn(async () => undefined);
const closePasswordHasherPoolMock = jest.fn(async () => undefined);
const mongooseConnectionCloseMock = jest.fn(async (_force?: boolean) => undefined);
const emailQueueCloseMock = jest.fn(async () => undefined);

jest.mock('../modules/email/email.worker', () => ({
  closeEmailWorker: () => closeEmailWorkerMock(),
}));
jest.mock('../modules/users/password-hasher', () => ({
  closePasswordHasherPool: () => closePasswordHasherPoolMock(),
}));
jest.mock('../modules/email/email.queue', () => ({
  emailQueue: { close: () => emailQueueCloseMock() },
}));
jest.mock('mongoose', () => ({
  connection: { close: (force: boolean) => mongooseConnectionCloseMock(force) },
}));

// @swc/jest не хойстит jest.mock() выше import — require() после jest.mock(), не import,
// для модуля под тестом и всего, что он транзитивно тянет (тот же принцип, что и в
// auth.service.unit.spec.ts, см. Obsidian: Jest/4).
//
// shuttingDown в shutdown.ts — module-level флаг, не сбрасывается сам между тестами.
// jest.resetModules() + повторный require() в beforeEach — единственный способ получить
// каждый раз чистый модуль с shuttingDown === false, а не расследовать накопленное
// состояние от предыдущего теста этого же файла.
let registerGracefulShutdown: typeof import('../shutdown').registerGracefulShutdown;
let isShuttingDown: typeof import('../shutdown').isShuttingDown;

function createFakeServer(overrides: Partial<Server> = {}): Server {
  return {
    close: jest.fn((callback?: (err?: Error) => void) => {
      callback?.();
      return undefined as unknown as Server;
    }),
    closeIdleConnections: jest.fn(),
    closeAllConnections: jest.fn(),
    ...overrides,
  } as unknown as Server;
}

// process — общий, реальный EventEmitter на весь тестовый процесс: если не снимать
// слушателей между тестами, они накопятся и следующий emit() вызовет shutdown() N раз.
function clearShutdownListeners(): void {
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
}

describe('shutdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearShutdownListeners();
    jest.resetModules();
    ({ registerGracefulShutdown, isShuttingDown } = require('../shutdown'));
  });

  afterEach(() => {
    clearShutdownListeners();
  });

  describe('Обычный SIGTERM', () => {
    it('должен закрыть HTTP-сервер, все зависимости и выйти с кодом 0', async () => {
      const server = createFakeServer();
      registerGracefulShutdown(server);

      process.emit('SIGTERM');
      await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());

      expect(server.close).toHaveBeenCalledTimes(1);
      expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
      expect(closeEmailWorkerMock).toHaveBeenCalledTimes(1);
      expect(emailQueueCloseMock).toHaveBeenCalledTimes(1);
      expect(closePasswordHasherPoolMock).toHaveBeenCalledTimes(1);
      expect(mongooseConnectionCloseMock).toHaveBeenCalledWith(false);
      expect(exitMock).toHaveBeenCalledWith(0);
    });

    it('isShuttingDown() должен стать true сразу по получении сигнала, не дожидаясь закрытия зависимостей', () => {
      const server = createFakeServer({
        // close() специально не вызывает callback — имитирует ещё не завершившийся дренаж.
        close: jest.fn() as unknown as Server['close'],
      });
      registerGracefulShutdown(server);

      expect(isShuttingDown()).toBe(false);
      process.emit('SIGTERM');
      expect(isShuttingDown()).toBe(true);
    });
  });

  describe('Идемпотентность — повторный сигнал во время уже идущей остановки', () => {
    it('не должен второй раз закрывать сервер/зависимости', async () => {
      const server = createFakeServer({
        // Не резолвится сразу — эмулирует реально идущий дренаж соединений.
        close: jest.fn() as unknown as Server['close'],
      });
      registerGracefulShutdown(server);

      process.emit('SIGTERM');
      process.emit('SIGTERM');
      process.emit('SIGINT');

      expect(server.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('server.close() завершился с ошибкой', () => {
    it('должен выйти с кодом 1, а не 0', async () => {
      const server = createFakeServer({
        close: jest.fn((callback?: (err?: Error) => void) => {
          callback?.(new Error('close failed'));
          return undefined as unknown as Server;
        }) as unknown as Server['close'],
      });
      registerGracefulShutdown(server);

      process.emit('SIGTERM');
      await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());

      expect(exitMock).toHaveBeenCalledWith(1);
      // Зависимости не должны закрываться после ошибки HTTP-сервера — раздел 5 заметки 31
      // (этот же принцип: сначала HTTP, только потом БД/очередь).
      expect(mongooseConnectionCloseMock).not.toHaveBeenCalled();
    });
  });

  describe('unhandledRejection', () => {
    it('должен запускать ту же процедуру остановки', async () => {
      const server = createFakeServer();
      registerGracefulShutdown(server);

      process.emit('unhandledRejection', new Error('boom'), Promise.resolve());
      await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());

      expect(server.close).toHaveBeenCalledTimes(1);
      expect(exitMock).toHaveBeenCalledWith(0);
    });
  });
});
