import { parsePostboxEvent, PostboxEvent } from './postbox-events';

// Постоянное чтение потока событий Postbox. Postbox пишет уведомления в поток Yandex Data Streams
// (Kinesis-совместимый API), поэтому потребитель работает "на вытягивание" — ему не нужен ни
// публичный адрес приложения, ни вебхук; работает и с localhost.
export interface StreamRecord {
  data: Uint8Array;
  sequenceNumber: string;
}

export interface StreamClient {
  listShards(): Promise<string[]>;
  getShardIterator(shardId: string, afterSequenceNumber: string | null): Promise<string>;
  getRecords(iterator: string, limit: number): Promise<{ records: StreamRecord[]; nextIterator: string | null }>;
}

// Где хранится позиция чтения: после рестарта продолжаем с неё, а не с начала потока.
export interface CheckpointStore {
  get(shardId: string): Promise<string | null>;
  save(shardId: string, sequenceNumber: string): Promise<void>;
}

export interface PostboxEventsConsumerOptions {
  client: StreamClient;
  checkpoints: CheckpointStore;
  onEvent: (event: PostboxEvent) => Promise<void>;
  pollIntervalMs?: number;
  batchLimit?: number;
  maxBackoffMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_BATCH_LIMIT = 100;
const DEFAULT_MAX_BACKOFF_MS = 60_000;

export class PostboxEventsConsumer {
  private stopped = true;
  private loop: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  private iterators = new Map<string, string>();

  private readonly pollIntervalMs: number;
  private readonly batchLimit: number;
  private readonly maxBackoffMs: number;

  constructor(private readonly options: PostboxEventsConsumerOptions) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.batchLimit = options.batchLimit ?? DEFAULT_BATCH_LIMIT;
    this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  }

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.loop = this.run();
  }

  // Останавливает цикл и дожидается завершения текущей итерации — для graceful shutdown.
  async stop(): Promise<void> {
    this.stopped = true;
    this.wake?.();
    await this.loop;
    this.loop = null;
  }

  // Одна итерация по всем сегментам. Возвращает число обработанных записей — 0 значит "потока
  // нет новых событий", можно спать pollInterval. Публичный для тестов.
  async pollOnce(): Promise<number> {
    let processed = 0;
    for (const shardId of await this.options.client.listShards()) {
      processed += await this.pollShard(shardId);
    }
    return processed;
  }

  private async pollShard(shardId: string): Promise<number> {
    let iterator = this.iterators.get(shardId);
    if (!iterator) {
      iterator = await this.options.client.getShardIterator(shardId, await this.options.checkpoints.get(shardId));
    }

    let result;
    try {
      result = await this.options.client.getRecords(iterator, this.batchLimit);
    } catch (error) {
      // Итератор мог протухнуть (живёт 5 минут) — при следующем заходе получим новый от контрольной точки
      this.iterators.delete(shardId);
      throw error;
    }

    for (const record of result.records) {
      const event = parsePostboxEvent(record.data);
      if (event) {
        // Ошибка обработчика (например, БД недоступна) уходит наверх, контрольная точка НЕ
        // двигается — событие будет прочитано и применено снова (применение идемпотентно).
        await this.options.onEvent(event);
      } else {
        console.warn('Postbox: запись потока не похожа на событие — пропущена');
      }
      await this.options.checkpoints.save(shardId, record.sequenceNumber);
    }

    if (result.nextIterator) {
      this.iterators.set(shardId, result.nextIterator);
    } else {
      this.iterators.delete(shardId);
    }
    return result.records.length;
  }

  private async run(): Promise<void> {
    let failures = 0;
    while (!this.stopped) {
      let delay = this.pollIntervalMs;
      try {
        const processed = await this.pollOnce();
        failures = 0;
        // Были события — сразу читаем дальше: в потоке может быть ещё
        delay = processed > 0 ? 0 : this.pollIntervalMs;
      } catch (error) {
        failures += 1;
        delay = Math.min(this.maxBackoffMs, this.pollIntervalMs * 2 ** Math.min(failures, 10));
        console.error(`Postbox events: ошибка чтения потока (попытка ${failures}), повтор через ${delay}мс:`, error);
      }
      await this.sleep(delay);
    }
  }

  private sleep(ms: number): Promise<void> {
    if (this.stopped) {
      return Promise.resolve();
    }
    // Даже при "спать не надо" уступаем event loop: иначе цикл из одних микрозадач
    // (поток с непрерывными событиями) не даст сработать ни таймерам, ни сигналу остановки.
    if (ms <= 0) {
      return new Promise(resolve => setImmediate(resolve));
    }
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }
}
