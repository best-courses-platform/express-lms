import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PostboxEvent } from '../postbox-events';
import {
  PostboxEventsConsumer,
  type CheckpointStore,
  type DeadLetterStore,
  type StreamClient,
  type StreamRecord,
} from '../postbox-events.consumer';

function record(event: object | string, sequenceNumber: string): StreamRecord {
  const text = typeof event === 'string' ? event : JSON.stringify(event);
  return { data: Buffer.from(text), sequenceNumber };
}

describe('PostboxEventsConsumer', () => {
  const client = {
    listShards: jest.fn<StreamClient['listShards']>(),
    getShardIterator: jest.fn<StreamClient['getShardIterator']>(),
    getRecords: jest.fn<StreamClient['getRecords']>(),
  };
  const checkpoints = {
    get: jest.fn<CheckpointStore['get']>(),
    save: jest.fn<CheckpointStore['save']>(),
  };
  const deadLetters = { save: jest.fn<DeadLetterStore['save']>() };
  const isDependencyHealthy = jest.fn<() => Promise<boolean>>();
  const onEvent = jest.fn<(event: PostboxEvent) => Promise<void>>();

  function createConsumer(maxAttempts = 3) {
    return new PostboxEventsConsumer({
      client,
      checkpoints,
      deadLetters,
      isDependencyHealthy,
      onEvent,
      pollIntervalMs: 5,
      maxBackoffMs: 10,
      maxAttempts,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    client.listShards.mockResolvedValue(['shard-0']);
    client.getShardIterator.mockResolvedValue('iter-1');
    client.getRecords.mockResolvedValue({ records: [], nextIterator: 'iter-2' });
    checkpoints.get.mockResolvedValue(null);
    checkpoints.save.mockResolvedValue(undefined);
    onEvent.mockResolvedValue(undefined);
    deadLetters.save.mockResolvedValue(undefined);
    isDependencyHealthy.mockResolvedValue(true);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('должен прочитать события, передать каждое обработчику и сохранить контрольную точку по каждой записи', async () => {
    client.getRecords.mockResolvedValue({
      records: [record({ eventType: 'Bounce' }, '11'), record({ eventType: 'Delivery' }, '12')],
      nextIterator: 'iter-2',
    });

    const processed = await createConsumer().pollOnce();

    expect(processed).toBe(2);
    expect(onEvent.mock.calls.map(([event]) => event.eventType)).toEqual(['Bounce', 'Delivery']);
    expect(checkpoints.save.mock.calls).toEqual([
      ['shard-0', '11'],
      ['shard-0', '12'],
    ]);
  });

  it('должен начать чтение с самого начала потока, если контрольной точки ещё нет', async () => {
    await createConsumer().pollOnce();

    expect(client.getShardIterator).toHaveBeenCalledWith('shard-0', null);
  });

  it('должен продолжить с сохранённой контрольной точки после рестарта', async () => {
    checkpoints.get.mockResolvedValue('12');

    await createConsumer().pollOnce();

    expect(client.getShardIterator).toHaveBeenCalledWith('shard-0', '12');
  });

  it('должен переиспользовать NextShardIterator, а не запрашивать новый итератор на каждой итерации', async () => {
    const consumer = createConsumer();

    await consumer.pollOnce();
    await consumer.pollOnce();

    expect(client.getShardIterator).toHaveBeenCalledTimes(1);
    expect(client.getRecords.mock.calls.map(([iterator]) => iterator)).toEqual(['iter-1', 'iter-2']);
  });

  it('должен пропустить запись, не похожую на событие, и всё равно сдвинуть контрольную точку', async () => {
    client.getRecords.mockResolvedValue({
      records: [record('это не JSON', '21'), record({ eventType: 'Bounce' }, '22')],
      nextIterator: 'iter-2',
    });

    await createConsumer().pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(checkpoints.save.mock.calls.map(([, sequence]) => sequence)).toEqual(['21', '22']);
    // битая запись не теряется молча, а откладывается с причиной
    expect(deadLetters.save).toHaveBeenCalledTimes(1);
    expect(deadLetters.save).toHaveBeenCalledWith(
      expect.objectContaining({ shardId: 'shard-0', sequenceNumber: '21', data: 'это не JSON', attempts: 0 })
    );
  });

  it('не должен двигать контрольную точку, если обработчик упал — событие будет прочитано снова', async () => {
    client.getRecords.mockResolvedValue({ records: [record({ eventType: 'Bounce' }, '31')], nextIterator: 'iter-2' });
    onEvent.mockRejectedValue(new Error('mongo down'));

    await expect(createConsumer().pollOnce()).rejects.toThrow('mongo down');

    expect(checkpoints.save).not.toHaveBeenCalled();
  });

  it('должен забыть итератор при ошибке чтения (например, протух) и получить новый при следующей итерации', async () => {
    const consumer = createConsumer();
    await consumer.pollOnce();
    client.getRecords.mockRejectedValueOnce(new Error('ExpiredIteratorException'));

    await expect(consumer.pollOnce()).rejects.toThrow('ExpiredIteratorException');
    await consumer.pollOnce();

    expect(client.getShardIterator).toHaveBeenCalledTimes(2);
  });

  it('должен читать все сегменты потока', async () => {
    client.listShards.mockResolvedValue(['shard-0', 'shard-1']);
    client.getRecords.mockResolvedValue({ records: [record({ eventType: 'Bounce' }, '1')], nextIterator: 'next' });

    const processed = await createConsumer().pollOnce();

    expect(processed).toBe(2);
    expect(client.getShardIterator).toHaveBeenCalledWith('shard-0', null);
    expect(client.getShardIterator).toHaveBeenCalledWith('shard-1', null);
  });

  it('start/stop: цикл работает в фоне, ошибки не роняют его, stop() дожидается завершения', async () => {
    client.getRecords
      .mockRejectedValueOnce(new Error('сеть моргнула'))
      .mockResolvedValue({ records: [record({ eventType: 'Bounce' }, '41')], nextIterator: 'next' });
    const consumer = createConsumer();

    consumer.start();
    await new Promise(resolve => setTimeout(resolve, 80));
    await consumer.stop();

    expect(onEvent).toHaveBeenCalled();
    const callsAfterStop = client.getRecords.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(client.getRecords.mock.calls.length).toBe(callsAfterStop);
  });

  describe('запись, на которой обработчик стабильно падает (отстойник)', () => {
    const poison = record({ eventType: 'Bounce', eventId: 'evt-poison:0' }, '31');
    const next = record({ eventType: 'Delivery' }, '32');

    beforeEach(() => {
      client.getRecords.mockResolvedValue({ records: [poison, next], nextIterator: 'iter-2' });
      onEvent.mockImplementation(async event => {
        if (event.eventId === 'evt-poison:0') {
          throw new Error('TypeError: сломанная запись');
        }
      });
    });

    it('до исчерпания попыток ошибка уходит наверх, точка не двигается, в отстойник ничего не попадает', async () => {
      const consumer = createConsumer(3);

      await expect(consumer.pollOnce()).rejects.toThrow('сломанная запись');
      await expect(consumer.pollOnce()).rejects.toThrow('сломанная запись');

      expect(deadLetters.save).not.toHaveBeenCalled();
      expect(checkpoints.save).not.toHaveBeenCalled();
    });

    it('после maxAttempts неудач подряд при здоровой БД запись откладывается, точка двигается и чтение идёт дальше', async () => {
      const consumer = createConsumer(3);
      await expect(consumer.pollOnce()).rejects.toThrow();
      await expect(consumer.pollOnce()).rejects.toThrow();

      const processed = await consumer.pollOnce();

      expect(processed).toBe(2);
      expect(deadLetters.save).toHaveBeenCalledWith(
        expect.objectContaining({
          shardId: 'shard-0',
          sequenceNumber: '31',
          eventId: 'evt-poison:0',
          attempts: 3,
          error: 'TypeError: сломанная запись',
        })
      );
      expect(checkpoints.save.mock.calls.map(([, sequence]) => sequence)).toEqual(['31', '32']);
      expect(onEvent.mock.calls.map(([event]) => event.eventType)).toContain('Delivery');
    });

    it('если БД недоступна, запись НЕ откладывается, сколько бы раз ни упало — виновата не запись', async () => {
      isDependencyHealthy.mockResolvedValue(false);
      const consumer = createConsumer(3);

      for (let i = 0; i < 6; i++) {
        await expect(consumer.pollOnce()).rejects.toThrow();
      }

      expect(deadLetters.save).not.toHaveBeenCalled();
      expect(checkpoints.save).not.toHaveBeenCalled();
    });

    it('ошибка самой проверки здоровья считается «недоступна» и тоже не отправляет запись в отстойник', async () => {
      isDependencyHealthy.mockRejectedValue(new Error('ping failed'));
      const consumer = createConsumer(1);

      await expect(consumer.pollOnce()).rejects.toThrow('сломанная запись');

      expect(deadLetters.save).not.toHaveBeenCalled();
    });

    it('после восстановления БД накопленный счёт неудач не отправляет запись в отстойник раньше срока', async () => {
      isDependencyHealthy.mockResolvedValue(false);
      const consumer = createConsumer(3);
      for (let i = 0; i < 5; i++) {
        await expect(consumer.pollOnce()).rejects.toThrow();
      }
      isDependencyHealthy.mockResolvedValue(true);

      // счёт уже превышен, а БД снова жива и запись всё ещё падает — теперь виновата запись
      await consumer.pollOnce();

      expect(deadLetters.save).toHaveBeenCalledTimes(1);
    });

    it('успешная обработка сбрасывает счётчик: единичные сбои разных записей не накапливаются', async () => {
      let calls = 0;
      onEvent.mockImplementation(async () => {
        calls += 1;
        if (calls === 1 || calls === 3) {
          throw new Error('временный сбой');
        }
      });
      client.getRecords.mockResolvedValue({ records: [poison], nextIterator: 'iter-2' });
      const consumer = createConsumer(2);

      await expect(consumer.pollOnce()).rejects.toThrow(); // 1-я неудача
      await consumer.pollOnce(); // успех, счёт сброшен
      await expect(consumer.pollOnce()).rejects.toThrow(); // снова 1-я, а не 2-я

      expect(deadLetters.save).not.toHaveBeenCalled();
    });

    it('если не удалось сохранить в отстойник, ошибка уходит наверх и точка не двигается', async () => {
      deadLetters.save.mockRejectedValue(new Error('mongo down'));
      const consumer = createConsumer(1);

      await expect(consumer.pollOnce()).rejects.toThrow('mongo down');

      expect(checkpoints.save).not.toHaveBeenCalled();
    });
  });

});
