import { afterAll, afterEach, beforeAll } from '@jest/globals';
import mongoose from 'mongoose';
import { config } from '../src/config';

// Один in-memory mongod на весь прогон (поднят в globalSetup), но при параллельных
// jest-воркерах каждый файл должен работать со своей собственной базой — иначе
// beforeEach/afterEach в одном файле чистил бы данные, которые в этот момент
// использует другой файл в соседнем воркере. JEST_WORKER_ID Jest выставляет сам,
// уникален на воркер — используем как имя БД внутри одного и того же mongod.
const dbName = `test-worker-${process.env.JEST_WORKER_ID ?? '1'}`;

beforeAll(async () => {
  await mongoose.connect(config.mongoUri, { dbName });
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map(collection => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
