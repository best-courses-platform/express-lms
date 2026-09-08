// Единый парсер длительности — нужен и для jwt.sign({ expiresIn }) (принимает строку как
// есть), и для res.cookie({ maxAge }) / new Date(Date.now() + ttl) (нужно число мс). Раньше
// cookie maxAge был захардкожен отдельным числом (8 * 60 * 60 * 1000) рядом с
// config.jwtAccessExpiresIn ('8h') — два места, которые нужно было менять синхронно вручную;
// расхождение между ними не ловится ни typecheck, ни тестами.
const UNIT_TO_MS = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5 } as const;

export function parseDurationMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(value.trim());

  if (!match) {
    throw new Error(`Некорректная длительность: "${value}"`);
  }

  const [, amount, unit] = match;
  return Number(amount) * UNIT_TO_MS[(unit ?? 's') as keyof typeof UNIT_TO_MS];
}
