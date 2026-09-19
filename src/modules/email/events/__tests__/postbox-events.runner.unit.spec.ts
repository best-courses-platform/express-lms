import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Runner решает, запускать ли потребитель, по настройкам: явный выключатель POSTBOX_EVENTS_ENABLED и
// наличие всех четырёх POSTBOX_EVENTS_*. Сам потребитель, Kinesis-клиент и Mongo мокаются: проверяется
// только условие запуска. @swc/jest не хойстит jest.mock() выше import — require() после jest.mock().
const startMock = jest.fn();
const stopMock = jest.fn(async () => undefined);
const ConsumerCtor = jest.fn().mockImplementation(() => ({ start: startMock, stop: stopMock }));

jest.mock('../postbox-events.consumer', () => ({ PostboxEventsConsumer: ConsumerCtor }));
jest.mock('../postbox-events.kinesis', () => ({
  createKinesisStreamClient: jest.fn(() => ({})),
  mongoCheckpointStore: {},
  mongoDeadLetterStore: {},
  mongoIsHealthy: jest.fn(),
}));
jest.mock('../../suppression/suppression.service', () => ({ suppressionService: {} }));

const fullSettings = {
  enabled: true,
  endpoint: 'https://yds.example/ru-central1/folder/db',
  streamName: 'stream',
  keyId: 'key',
  secret: 'secret',
  pollIntervalMs: 5000,
};
const mockConfig = { postbox: { region: 'ru-central1', events: { ...fullSettings } } };
jest.mock('../../../../config', () => ({ config: mockConfig }));

type RunnerModule = typeof import('../postbox-events.runner');
let runner: RunnerModule;

describe('postbox-events.runner — условия запуска потребителя', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockConfig.postbox.events = { ...fullSettings };
    // Состояние (запущенный потребитель) — переменная модуля: чистый модуль в каждом тесте
    jest.resetModules();
    runner = require('../postbox-events.runner');
  });

  it('запускает потребитель, когда включён и заданы все четыре POSTBOX_EVENTS_*', () => {
    expect(runner.startPostboxEventsConsumer()).toBe(true);

    expect(ConsumerCtor).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it('POSTBOX_EVENTS_ENABLED=false не запускает потребитель, даже если все настройки заданы (общий Secret в API-поде)', () => {
    mockConfig.postbox.events.enabled = false;

    expect(runner.startPostboxEventsConsumer()).toBe(false);
    expect(ConsumerCtor).not.toHaveBeenCalled();
  });

  it.each(['endpoint', 'streamName', 'keyId', 'secret'] as const)('не запускается без %s', field => {
    mockConfig.postbox.events = { ...fullSettings, [field]: undefined as unknown as string };

    expect(runner.startPostboxEventsConsumer()).toBe(false);
    expect(ConsumerCtor).not.toHaveBeenCalled();
  });

  it('повторный вызов не создаёт второй потребитель', () => {
    runner.startPostboxEventsConsumer();

    expect(runner.startPostboxEventsConsumer()).toBe(false);
    expect(ConsumerCtor).toHaveBeenCalledTimes(1);
  });

  it('stopPostboxEventsConsumer безопасен без запуска, а после запуска останавливает и позволяет запустить снова', async () => {
    await expect(runner.stopPostboxEventsConsumer()).resolves.toBeUndefined();
    expect(stopMock).not.toHaveBeenCalled();

    runner.startPostboxEventsConsumer();
    await runner.stopPostboxEventsConsumer();
    expect(stopMock).toHaveBeenCalledTimes(1);

    expect(runner.startPostboxEventsConsumer()).toBe(true);
  });
});
