import {
  DescribeStreamCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  KinesisClient,
  ShardIteratorType,
} from '@aws-sdk/client-kinesis';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Schema, connection, model } from 'mongoose';
import { CheckpointStore, DeadLetter, DeadLetterStore, StreamClient } from './postbox-events.consumer';

export interface KinesisStreamClientOptions {
  // https://yds.serverless.yandexcloud.net/<регион>/<каталог>/<идентификатор БД YDB>
  endpoint: string;
  streamName: string;
  region: string;
  keyId: string;
  secret: string;
}

// Yandex Data Streams отдаёт поток по Kinesis-совместимому API (статический ключ сервисного
// аккаунта с ролью yds.viewer, подпись SigV4 — как у остальных SES/S3-совместимых сервисов).
export function createKinesisStreamClient(options: KinesisStreamClientOptions): StreamClient {
  const client = new KinesisClient({
    endpoint: options.endpoint,
    region: options.region,
    credentials: { accessKeyId: options.keyId, secretAccessKey: options.secret },
    // Kinesis-клиент AWS по умолчанию ходит по HTTP/2, а эндпоинт Yandex Data Streams отвечает
    // на него ERR_HTTP2_ERROR (Protocol error) — принудительно HTTP/1.1.
    requestHandler: new NodeHttpHandler(),
  });

  return {
    async listShards() {
      const description = await client.send(new DescribeStreamCommand({ StreamName: options.streamName }));
      return (description.StreamDescription?.Shards ?? [])
        .map(shard => shard.ShardId)
        .filter((id): id is string => !!id);
    },

    async getShardIterator(shardId, afterSequenceNumber) {
      const response = await client.send(
        new GetShardIteratorCommand({
          StreamName: options.streamName,
          ShardId: shardId,
          ...(afterSequenceNumber
            ? {
                ShardIteratorType: ShardIteratorType.AFTER_SEQUENCE_NUMBER,
                StartingSequenceNumber: afterSequenceNumber,
              }
            : { ShardIteratorType: ShardIteratorType.TRIM_HORIZON }),
        })
      );
      if (!response.ShardIterator) {
        throw new Error(`Data Streams не вернул итератор для сегмента ${shardId}`);
      }
      return response.ShardIterator;
    },

    async getRecords(iterator, limit) {
      const response = await client.send(new GetRecordsCommand({ ShardIterator: iterator, Limit: limit }));
      return {
        records: (response.Records ?? []).map(record => ({
          data: record.Data ?? new Uint8Array(),
          sequenceNumber: record.SequenceNumber ?? '',
        })),
        nextIterator: response.NextShardIterator ?? null,
      };
    },
  };
}

interface EmailEventCheckpoint {
  shardId: string;
  sequenceNumber: string;
}

const checkpointSchema = new Schema<EmailEventCheckpoint>(
  { shardId: { type: String, required: true, unique: true }, sequenceNumber: { type: String, required: true } },
  { timestamps: true, collection: 'emaileventcheckpoints' }
);
const CheckpointModel = model<EmailEventCheckpoint>('EmailEventCheckpoint', checkpointSchema);

export const mongoCheckpointStore: CheckpointStore = {
  async get(shardId) {
    const checkpoint = await CheckpointModel.findOne({ shardId }).lean().exec();
    return checkpoint?.sequenceNumber ?? null;
  },
  async save(shardId, sequenceNumber) {
    await CheckpointModel.updateOne({ shardId }, { $set: { sequenceNumber } }, { upsert: true }).exec();
  },
};

// Отстойник: записи потока, которые не удалось обработать (см. DeadLetterStore). Уникальность по
// сегменту и номеру записи — повторное откладывание той же записи не создаёт дубль.
const deadLetterSchema = new Schema<DeadLetter>(
  {
    shardId: { type: String, required: true },
    sequenceNumber: { type: String, required: true },
    eventId: { type: String },
    data: { type: String, required: true },
    error: { type: String, required: true },
    attempts: { type: Number, required: true },
  },
  { timestamps: true, collection: 'emaileventdeadletters' }
);
deadLetterSchema.index({ shardId: 1, sequenceNumber: 1 }, { unique: true });
const DeadLetterModel = model<DeadLetter>('EmailEventDeadLetter', deadLetterSchema);

export const mongoDeadLetterStore: DeadLetterStore = {
  async save(entry) {
    await DeadLetterModel.updateOne(
      { shardId: entry.shardId, sequenceNumber: entry.sequenceNumber },
      { $set: entry },
      { upsert: true }
    ).exec();
  },
};

// Быстрая проверка, что Mongo отвечает: readyState 1 (подключено) и ping.
export async function mongoIsHealthy(): Promise<boolean> {
  if (connection.readyState !== 1 || !connection.db) {
    return false;
  }
  await connection.db.admin().ping();
  return true;
}
