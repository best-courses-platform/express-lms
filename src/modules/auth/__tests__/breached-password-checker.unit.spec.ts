import { describe, it, expect, jest, afterEach } from '@jest/globals';
import crypto from 'crypto';

// Мокаем global.fetch тем же приёмом, что и github-oauth.strategy.unit.spec.ts — реальный
// сетевой запрос к api.pwnedpasswords.com в юнит-тесте недопустим (медленно, недетерминированно,
// зависит от внешнего сервиса).
function stubFetch(impl?: () => Promise<unknown>): jest.Mock {
  const fetchMock = jest.fn(impl) as unknown as jest.Mock;
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

// SHA-1('password123').toUpperCase() — известное фиксированное значение, не нужно вычислять
// в тесте заново тем же кодом, который проверяем (иначе тест ничего не проверил бы).
const PASSWORD = 'password123';
const SHA1_HEX = crypto.createHash('sha1').update(PASSWORD).digest('hex').toUpperCase();
const PREFIX = SHA1_HEX.slice(0, 5);
const SUFFIX = SHA1_HEX.slice(5);

describe('isPasswordBreached', () => {
  const originalFetch = global.fetch;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NODE_ENV = originalNodeEnv;
  });

  // isTestEnv в самом модуле вычисляется ОДИН РАЗ при импорте (process.env.NODE_ENV === 'test')
  // — тот же приём, что и email.queue.ts для Redis (см. email.queue.unit.spec.ts). Значит,
  // чтобы вообще проверить реальную HTTP-ветку ниже, нужно временно "притвориться" не тестовым
  // окружением ДО require() и откатить сразу после — jest.resetModules() + require(), не
  // import (см. общий комментарий об этом в auth.service.unit.spec.ts/config.unit.spec.ts).
  function loadWithFakeProdEnv(): { isPasswordBreached: (password: string) => Promise<boolean> } {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    return require('../breached-password-checker') as { isPasswordBreached: (password: string) => Promise<boolean> };
  }

  describe('В тестовом окружении (NODE_ENV=test, как и есть на самом деле в этом прогоне)', () => {
    it('всегда возвращает false и НИ РАЗУ не обращается к сети', async () => {
      // Given — живой инцидент 2026-09-02: 'password123' (стандартный пароль-фикстура
      // почти во всех тестах проекта, см. test/helpers.ts) реально числится в утечках HIBP.
      // Без bypass'а на NODE_ENV=test вся интеграционная сюита ловила бы честный 400
      // PASSWORD_BREACHED на каждой тестовой регистрации — не баг проверки, а то, что
      // тестовому окружению вообще не место дёргать сторонний HTTP API за вердиктом.
      const fetchMock = stubFetch();
      jest.resetModules();
      const { isPasswordBreached } = require('../breached-password-checker') as {
        isPasswordBreached: (password: string) => Promise<boolean>;
      };

      // When & Then
      await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('Вне тестового окружения — реальная HTTP-ветка', () => {
    it('отправляет наружу только 5-символьный префикс SHA-1, не сам пароль и не полный хеш (k-anonymity)', async () => {
      const fetchMock = stubFetch(async () => ({ ok: true, text: async () => '' }));
      const { isPasswordBreached } = loadWithFakeProdEnv();

      await isPasswordBreached(PASSWORD);

      expect(fetchMock).toHaveBeenCalledWith(
        `https://api.pwnedpasswords.com/range/${PREFIX}`,
        expect.objectContaining({ headers: { 'Add-Padding': 'true' } })
      );
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain(PASSWORD);
      expect(calledUrl).not.toContain(SUFFIX);
    });

    it('возвращает true, когда suffix найден среди строк ответа', async () => {
      stubFetch(async () => ({
        ok: true,
        text: async () => `AAAAA...:1\r\n${SUFFIX}:12345\r\nBBBBB...:2`,
      }));
      const { isPasswordBreached } = loadWithFakeProdEnv();

      await expect(isPasswordBreached(PASSWORD)).resolves.toBe(true);
    });

    it('возвращает false, когда suffix среди строк ответа не найден', async () => {
      stubFetch(async () => ({
        ok: true,
        text: async () => 'AAAAA...:1\r\nBBBBB...:2',
      }));
      const { isPasswordBreached } = loadWithFakeProdEnv();

      await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);
    });

    it('сравнивает именно часть ДО ":" — не считает совпадением суффикс чужой строки, начинающийся так же', async () => {
      // Например, если наш SUFFIX случайно является префиксом чужого более длинного значения —
      // startsWith() на всю строку дал бы ложное совпадение, split(':')[0] === suffix — нет.
      stubFetch(async () => ({
        ok: true,
        text: async () => `${SUFFIX}EXTRA:1`,
      }));
      const { isPasswordBreached } = loadWithFakeProdEnv();

      await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);
    });

    it('fail-open: возвращает false, когда HIBP отвечает не 200 (не блокирует auth-поток из-за стороннего сбоя)', async () => {
      stubFetch(async () => ({ ok: false, status: 503, text: async () => '' }));
      const { isPasswordBreached } = loadWithFakeProdEnv();

      await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);
    });

    it('fail-open: возвращает false, когда fetch падает по сети/таймауту, а не пробрасывает ошибку выше', async () => {
      stubFetch(() => Promise.reject(new Error('network error')));
      const { isPasswordBreached } = loadWithFakeProdEnv();

      await expect(isPasswordBreached(PASSWORD)).resolves.toBe(false);
    });
  });
});
