// Обёртка над fetch с обязательным таймаутом и опциональным ретраем транзиентных сбоев —
// см. Obsidian: "Устойчивость внешних вызовов — Timeout, Retry, Circuit Breaker, Bulkhead"
// (общая теория) и "Чем можно улучшить и как" (прикладной план для этого проекта).
//
// retries по умолчанию 0 (просто таймаут, без единой повторной попытки) — сознательно,
// не "на всякий случай побольше": ретраить можно только идемпотентные операции, а эта
// обёртка одна на все вызовы, включая потенциально неидемпотентные. Включать retries > 0
// обязана явно та сторона, которая знает, что конкретный вызов идемпотентен.

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface ResilientFetchOptions extends Omit<RequestInit, 'signal'> {
  /** Обязателен — без него внешний вызов не должен уметь висеть бесконечно. */
  timeoutMs: number;
  /** Сколько ПОВТОРНЫХ попыток после первой (0 — без ретрая, значение по умолчанию). */
  retries?: number;
  /** База экспоненциального backoff в мс — реальная задержка добавляет джиттер, см. ниже. */
  baseDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Экспоненциальный backoff + джиттер (случайная добавка) — без джиттера все клиенты,
// поймавшие один и тот же сбой одновременно, повторили бы попытку синхронно, той же волной,
// что и первая (thundering herd). Джиттер размазывает повторные попытки во времени.
function backoffDelayMs(attempt: number, baseDelayMs: number): number {
  const exponential = baseDelayMs * 2 ** attempt;
  return exponential + Math.random() * baseDelayMs;
}

// Retry-After (RFC 9110 §10.2.3) — целое число секунд либо HTTP-дата. null, если заголовка
// нет или он не распознан — тогда используется обычный backoff, а не игнорируется retry.
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) {
    return null;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(header);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

export async function resilientFetch(url: string, options: ResilientFetchOptions): Promise<Response> {
  const { timeoutMs, retries = 0, baseDelayMs = 500, ...init } = options;
  const maxAttempts = retries + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts - 1;
    let response: Response;

    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      // Сетевая ошибка или сам таймаут (AbortError) — ретраим по тому же принципу,
      // что и 5xx/429 ниже, если попытки ещё остались.
      if (isLastAttempt) {
        throw error;
      }
      await sleep(backoffDelayMs(attempt, baseDelayMs));
      continue;
    }

    // Успех, либо статус, который не имеет смысла повторять (4xx кроме 429 — повторный
    // запрос с тем же телом/токеном получит тот же ответ), либо попытки кончились —
    // в любом из трёх случаев отдаём ответ как есть, вызывающая сторона сама решает, что с ним делать.
    if (response.ok || !RETRYABLE_STATUSES.has(response.status) || isLastAttempt) {
      return response;
    }

    await sleep(retryAfterMs(response) ?? backoffDelayMs(attempt, baseDelayMs));
  }

  // Недостижимо: maxAttempts >= 1, и последняя итерация цикла всегда либо возвращает,
  // либо бросает выше. TS не выводит это сам из формы цикла — оставлен explicit unreachable.
  throw new Error('resilientFetch: unreachable');
}
