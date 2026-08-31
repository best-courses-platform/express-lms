import { MongoMemoryReplSet } from 'mongodb-memory-server';

export default async function globalTeardown(): Promise<void> {
  const mongod = (globalThis as unknown as { __MONGOD__?: MongoMemoryReplSet }).__MONGOD__;
  if (mongod) {
    await mongod.stop();
  }
}
