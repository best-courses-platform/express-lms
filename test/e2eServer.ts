import fs from 'fs';
import path from 'path';
import './setupTestEnv';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Отдельный от Jest бутстрап реального Express-процесса для Playwright E2E (lms-web) —
// поднимает настоящий app.ts (все роуты, middleware, passport) поверх эфемерной MongoDB,
// тем же приёмом, что и test/globalSetup.ts для Jest-интеграционных тестов, но здесь это
// не библиотечный хук, а самостоятельный долгоживущий процесс, слушающий реальный порт.
//
// ./setupTestEnv — тот же файл, что и setupFiles в jest.config.js: NODE_ENV=test (отключает
// rate-limit, см. middleware/rate-limit.ts), фиктивные JWT/OAuth-креды, EMAIL_*/SELECTEL_*
// обнулены (mock-режим email/S3), FRONTEND_URL=http://localhost:3001 — порт, на котором
// Playwright поднимает lms-web (см. webServer в lms-web/playwright.config.ts). Импортирован
// раньше src/app — config/index.ts вычисляет config один раз при импорте, из process.env,
// каким он есть В ЭТОТ момент.
const MONGO_URI_FILE = path.join(__dirname, '.e2e-mongo-uri');

async function main(): Promise<void> {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'best-courses-ever-e2e' } });
  process.env.MONGO_URI = mongod.getUri();

  // Playwright-хелперы (lms-web/e2e/helpers.ts) читают этот файл, чтобы подключиться к той
  // же самой эфемерной базе напрямую — например, достать токен подтверждения email, раз
  // реальные письма в mock-режиме не отправляются (тот же трюк, что registerVerifiedUser
  // в test/helpers.ts делает для Jest-тестов, только через процесс, а не через require).
  // Порт mongod не фиксируем заранее (риск конфликта с уже занятым портом) — вместо этого
  // публикуем реально полученный URI как факт после старта.
  fs.writeFileSync(MONGO_URI_FILE, process.env.MONGO_URI, 'utf-8');

  await mongoose.connect(process.env.MONGO_URI);

  const { default: app } = await import('../src/app');
  const port = Number(process.env.PORT ?? 3000);

  const server = app.listen(port, () => {
    console.log(`[e2e] express-lms слушает http://localhost:${port} (MongoDB: ${process.env.MONGO_URI})`);
  });

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    fs.rmSync(MONGO_URI_FILE, { force: true });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(error => {
  console.error('[e2e] Не удалось запустить express-lms для E2E:', error);
  process.exit(1);
});
