import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { mongoCheckpointStore, mongoDeadLetterStore, mongoIsHealthy } from '../postbox-events.kinesis';

// Реальный Mongoose поверх mongodb-memory-server: уникальный индекс отстойника, upsert и ping
// проверяются на настоящей БД, а не на моке.
describe('Mongo-хранилища потребителя событий Postbox (реальная БД)', () => {
  const entry = {
    shardId: 'shard-0',
    sequenceNumber: '100',
    eventId: 'evt-1:0',
    data: '{"eventType":"Bounce"}',
    error: 'TypeError: сломанная запись',
    attempts: 5,
  };

  it('отстойник сохраняет запись со всеми полями', async () => {
    await mongoDeadLetterStore.save(entry);

    const stored = await mongoose.connection.collection('emaileventdeadletters').findOne({ sequenceNumber: '100' });
    expect(stored).toMatchObject(entry);
  });

  it('повторное откладывание той же записи идемпотентно: одна запись, поля обновляются', async () => {
    await mongoDeadLetterStore.save({ ...entry, sequenceNumber: '101', attempts: 5 });
    await mongoDeadLetterStore.save({ ...entry, sequenceNumber: '101', attempts: 6, error: 'другая ошибка' });

    const records = await mongoose.connection.collection('emaileventdeadletters').find({ sequenceNumber: '101' }).toArray();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ attempts: 6, error: 'другая ошибка' });
  });

  it('записи разных сегментов с одним номером не склеиваются', async () => {
    await mongoDeadLetterStore.save({ ...entry, shardId: 'shard-A', sequenceNumber: '200' });
    await mongoDeadLetterStore.save({ ...entry, shardId: 'shard-B', sequenceNumber: '200' });

    expect(await mongoose.connection.collection('emaileventdeadletters').countDocuments({ sequenceNumber: '200' })).toBe(2);
  });

  it('контрольная точка: нет записи → null, после сохранения возвращается, перезаписывается', async () => {
    expect(await mongoCheckpointStore.get('shard-new')).toBeNull();

    await mongoCheckpointStore.save('shard-new', '10');
    await mongoCheckpointStore.save('shard-new', '11');

    expect(await mongoCheckpointStore.get('shard-new')).toBe('11');
  });

  it('mongoIsHealthy при живом подключении возвращает true', async () => {
    expect(await mongoIsHealthy()).toBe(true);
  });
});
