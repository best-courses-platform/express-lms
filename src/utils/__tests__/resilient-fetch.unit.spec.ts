import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { resilientFetch } from '../resilient-fetch';

// global.fetch — тот же приём, что и в breached-password-checker.unit.spec.ts/
// github-oauth.strategy.unit.spec.ts: реальный сетевой запрос в юнит-тесте недопустим.
function stubFetch(impl: (...args: unknown[]) => Promise<unknown>): jest.Mock {
  const fetchMock = jest.fn(impl) as unknown as jest.Mock;
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

// setTimeout внутри resilient-fetch.ts (backoff между попытками) — реальные таймеры сделали
// бы тест на ретраи медленным и хрупким. Фейковые таймеры + advanceTimersByTimeAsync —
// управляем временем детерминированно, без ожидания в реальности.
async function withFakeTimers<T>(promise: Promise<T>): Promise<T> {
  let settled = false;
  // .catch() здесь — только чтобы избежать unhandledRejection на производном промисе;
  // сам оригинальный `promise` возвращается ниже нетронутым, его отклонение по-прежнему
  // долетает до вызывающего теста через await/rejects.
  promise.finally(() => {
    settled = true;
  }).catch(() => undefined);
  for (let i = 0; i < 20 && !settled; i++) {
    await jest.advanceTimersByTimeAsync(60_000);
  }
  return promise;
}

describe('resilientFetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  describe('Успех с первой попытки', () => {
    it('не ретраит и возвращает ответ как есть', async () => {
      const fetchMock = stubFetch(async () => new Response('ok', { status: 200 }));

      const response = await resilientFetch('https://example.com', { timeoutMs: 1000 });

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('передаёт AbortSignal в fetch — таймаут реально включён', async () => {
      stubFetch(async () => new Response(null, { status: 200 }));

      await resilientFetch('https://example.com', { timeoutMs: 1000 });

      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('retries по умолчанию — 0', () => {
    it('сетевая ошибка без явного retries бросается сразу, без единой повторной попытки', async () => {
      const fetchMock = stubFetch(async () => {
        throw new Error('network down');
      });

      await expect(resilientFetch('https://example.com', { timeoutMs: 1000 })).rejects.toThrow('network down');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('5xx без явного retries возвращается как есть, без ретрая', async () => {
      const fetchMock = stubFetch(async () => new Response(null, { status: 503 }));

      const response = await resilientFetch('https://example.com', { timeoutMs: 1000 });

      expect(response.status).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Ретрай транзиентных сбоев', () => {
    it('сетевая ошибка → повторяет попытку и возвращает успех со второй', async () => {
      let call = 0;
      const fetchMock = stubFetch(async () => {
        call += 1;
        if (call === 1) {throw new Error('ECONNRESET');}
        return new Response('ok', { status: 200 });
      });

      const response = await withFakeTimers(resilientFetch('https://example.com', { timeoutMs: 1000, retries: 2 }));

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('503 → повторяет попытку и возвращает успех со второй', async () => {
      let call = 0;
      const fetchMock = stubFetch(async () => {
        call += 1;
        return call === 1 ? new Response(null, { status: 503 }) : new Response('ok', { status: 200 });
      });

      const response = await withFakeTimers(resilientFetch('https://example.com', { timeoutMs: 1000, retries: 2 }));

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('исчерпав все попытки на устойчивом 500 — возвращает последний (неуспешный) ответ', async () => {
      const fetchMock = stubFetch(async () => new Response(null, { status: 500 }));

      const response = await withFakeTimers(resilientFetch('https://example.com', { timeoutMs: 1000, retries: 2 }));

      expect(response.status).toBe(500);
      expect(fetchMock).toHaveBeenCalledTimes(3); // 1 исходная + 2 ретрая
    });

    it('исчерпав все попытки на устойчивой сетевой ошибке — бросает её', async () => {
      const fetchMock = stubFetch(async () => {
        throw new Error('всё ещё недоступен');
      });

      await expect(
        withFakeTimers(resilientFetch('https://example.com', { timeoutMs: 1000, retries: 2 }))
      ).rejects.toThrow('всё ещё недоступен');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('Не ретраит то, что ретраить нельзя', () => {
    it.each([400, 401, 403, 404, 422])('%i возвращается сразу, даже если retries > 0', async status => {
      const fetchMock = stubFetch(async () => new Response(null, { status }));

      const response = await resilientFetch('https://example.com', { timeoutMs: 1000, retries: 3 });

      expect(response.status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry-After', () => {
    it('429 с Retry-After (секунды) — ждёт указанное время, а не случайный backoff', async () => {
      let call = 0;
      stubFetch(async () => {
        call += 1;
        return call === 1
          ? new Response(null, { status: 429, headers: { 'retry-after': '5' } })
          : new Response('ok', { status: 200 });
      });
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      await withFakeTimers(resilientFetch('https://example.com', { timeoutMs: 1000, retries: 1 }));

      // Задержка ровно 5000мс из заголовка, не случайный backoff (иначе не было бы
      // гарантии, что это точное значение, а не совпадение с диапазоном джиттера).
      const delays = setTimeoutSpy.mock.calls.map(call => call[1]);
      expect(delays).toContain(5000);
    });
  });
});
