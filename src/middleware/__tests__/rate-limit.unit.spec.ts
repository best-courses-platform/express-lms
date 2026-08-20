import { describe, it, expect, jest, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import type * as RateLimitModule from '../rate-limit';

// Unit-слой: реальный express-rate-limit поверх одноразового express-приложения (не
// mongodb-memory-server и не полный app — только сама middleware), без моков библиотеки —
// mock() здесь дал бы ложную уверенность (проверяли бы, что мок вызван, не что лимитер
// реально считает и блокирует запросы).
//
// Ключевая сложность: `isTestEnv` в rate-limit.ts вычисляется ОДИН РАЗ на верхнем уровне
// модуля в момент импорта (`const isTestEnv = process.env.NODE_ENV === 'test'`), а
// test/setupTestEnv.ts выставляет NODE_ENV=test до импорта любого тестового файла — то есть
// обычный `import { apiRateLimiter } from '../rate-limit'` всегда получил бы passthrough-
// заглушку, а не настоящий rateLimit(...), и реальное поведение лимитера вообще не
// проверилось бы. jest.resetModules() + require() внутри функции с временно
// переопределённым process.env.NODE_ENV — единственный способ заставить модуль
// пересчитать isTestEnv с других значений в этом же тестовом процессе.
function loadRateLimitModule(nodeEnv: string): typeof RateLimitModule {
  const originalNodeEnv = process.env.NODE_ENV;
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../rate-limit') as typeof RateLimitModule;
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
}

function createApp(limiter: express.RequestHandler) {
  const app = express();
  app.get('/x', limiter, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rate-limit middleware', () => {
  afterEach(() => {
    // На случай, если какой-то из тестов упал до восстановления NODE_ENV в finally —
    // не даём поломанному значению утечь в следующий тест того же файла.
    process.env.NODE_ENV = 'test';
    jest.resetModules();
  });

  describe('Когда NODE_ENV=test (как во время самого прогона тестов)', () => {
    it('apiRateLimiter должен быть no-op passthrough — не блокировать даже избыточные запросы', async () => {
      const { apiRateLimiter } = loadRateLimitModule('test');
      const app = createApp(apiRateLimiter);

      for (let i = 0; i < 15; i++) {
        const response = await request(app).get('/x');
        expect(response.status).toBe(200);
      }
    });

    it('authRateLimiter() должен быть no-op passthrough', async () => {
      const { authRateLimiter } = loadRateLimitModule('test');
      const app = createApp(authRateLimiter());

      for (let i = 0; i < 15; i++) {
        const response = await request(app).get('/x');
        expect(response.status).toBe(200);
      }
    });
  });

  describe('Когда NODE_ENV=production (настоящий лимитер)', () => {
    it(
      'authRateLimiter() должен пропустить ровно 10 запросов и вернуть 429 на 11-м с понятным сообщением',
      async () => {
        // Given
        const { authRateLimiter } = loadRateLimitModule('production');
        const app = createApp(authRateLimiter());

        // When — 10 запросов укладываются в лимит
        for (let i = 0; i < 10; i++) {
          const response = await request(app).get('/x');
          expect(response.status).toBe(200);
        }

        // Then — 11-й превышает лимит
        const blocked = await request(app).get('/x');
        expect(blocked.status).toBe(429);
        expect(blocked.body).toEqual({ error: 'Слишком много запросов. Попробуйте позже' });
      },
      15_000
    );

    it(
      'authRateLimiter() должен отдавать стандартные RateLimit-заголовки (standardHeaders: true)',
      async () => {
        const { authRateLimiter } = loadRateLimitModule('production');
        const app = createApp(authRateLimiter());

        const response = await request(app).get('/x');

        expect(response.headers).toHaveProperty('ratelimit-limit');
        expect(response.headers).toHaveProperty('ratelimit-remaining');
        expect(response.headers).not.toHaveProperty('x-ratelimit-limit');
      },
      15_000
    );

    it(
      'каждый вызов authRateLimiter() должен создавать независимый счётчик (регрессия — общий store между /login и /register)',
      async () => {
        // Given — комментарий в rate-limit.ts прямо утверждает независимость счётчиков между
        // вызовами фабрики; проверяем это утверждение, а не верим ему на слово.
        const { authRateLimiter } = loadRateLimitModule('production');
        const appA = createApp(authRateLimiter());
        const appB = createApp(authRateLimiter());

        // When — исчерпываем лимит на первом инстансе
        for (let i = 0; i < 10; i++) {
          await request(appA).get('/x');
        }
        const blockedOnA = await request(appA).get('/x');

        // Then — второй инстанс (другой вызов фабрики) не должен быть затронут
        const stillOkOnB = await request(appB).get('/x');
        expect(blockedOnA.status).toBe(429);
        expect(stillOkOnB.status).toBe(200);
      },
      15_000
    );

    it(
      'apiRateLimiter должен быть заметно менее строгим, чем authRateLimiter() — пропускает те же 11 запросов без 429',
      async () => {
        // Given — общий /api/* лимит (300) специально намного щедрее строгого auth-лимита
        // (10). Не гоняем полные 300 запросов (медленно и не добавляет уверенности сверх
        // того, что уже проверяет сам факт большего лимита) — достаточно показать, что
        // ровно тот объём трафика, который валит authRateLimiter, apiRateLimiter пропускает.
        const { apiRateLimiter } = loadRateLimitModule('production');
        const app = createApp(apiRateLimiter);

        for (let i = 0; i < 11; i++) {
          const response = await request(app).get('/x');
          expect(response.status).toBe(200);
        }
      },
      15_000
    );
  });
});
