import { MongoMemoryServer } from 'mongodb-memory-server';

// Запускается ОДИН раз перед всеми тестами integration-проекта, в главном процессе Jest —
// до того, как воркеры (где реально выполняются тестовые файлы) успевают запуститься.
// process.env, выставленный здесь, наследуется воркерами при их старте — поэтому
// config.mongoUri (читается тестовыми файлами позже, в другом процессе) корректно
// увидит URI поднятого in-memory сервера, а не дефолт из configSchema.
//
// Инстанс сервера сохраняем на global — globalSetup и globalTeardown выполняются
// в одном и том же процессе Jest CLI (в отличие от воркеров), поэтому обычная
// JS-переменная между ними не пережила бы, а global — переживает. Это официально
// задокументированный паттерн самого mongodb-memory-server для Jest.
export default async function globalSetup(): Promise<void> {
  const mongod = await MongoMemoryServer.create({
    instance: { dbName: 'best-courses-ever-test' },
  });

  process.env.MONGO_URI = mongod.getUri();
  (globalThis as unknown as { __MONGOD__: MongoMemoryServer }).__MONGOD__ = mongod;
}
