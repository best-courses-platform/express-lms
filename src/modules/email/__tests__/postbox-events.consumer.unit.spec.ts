import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PostboxEvent } from '../postbox-events';
import {
  PostboxEventsConsumer,
  type CheckpointStore,
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
  const onEvent = jest.fn<(event: PostboxEvent) => Promise<void>>();

  function createConsumer() {
    return new PostboxEventsConsumer({ client, checkpoints, onEvent, pollIntervalMs: 5, maxBackoffMs: 10 });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    client.listShards.mockResolvedValue(['shard-0']);
    client.getShardIterator.mockResolvedValue('iter-1');
    client.getRecords.mockResolvedValue({ records: [], nextIterator: 'iter-2' });
    checkpoints.get.mockResolvedValue(null);
    checkpoints.save.mockResolvedValue(undefined);
    onEvent.mockResolvedValue(undefined);
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
});
