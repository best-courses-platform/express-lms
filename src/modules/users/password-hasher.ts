import path from 'path';
import Piscina from 'piscina';

const DEFAULT_SALT_ROUNDS = 12;

// В dev/тестах процесс запускается через tsx/@swc-jest, а не `node dist/*.js` — __filename
// у скомпилированного кода сохраняет .ts. Worker-поток стартует как отдельный процесс без
// автоматической TS-транспиляции, поэтому в этом случае явно грузим ts-исходник воркера и
// регистрируем tsx как CJS require-хук (`-r tsx/cjs`) именно в этом потоке. В проде
// (`node dist/server.js`) __filename уже .js — воркер и так обычный CommonJS, хук не нужен.
const isTsRuntime = __filename.endsWith('.ts');

const pool = new Piscina({
  filename: path.resolve(__dirname, isTsRuntime ? 'password-hasher.worker.ts' : 'password-hasher.worker.js'),
  execArgv: isTsRuntime ? ['-r', 'tsx/cjs'] : [],
  // Без этого пул держит потоки живыми бесконечно даже без задач — процесс (и jest после
  // тестов) не завершался бы сам по себе, пришлось бы отдельно звать pool.destroy() везде.
  idleTimeout: 30000,
});

export async function hashPassword(password: string, saltRounds: number = DEFAULT_SALT_ROUNDS): Promise<string> {
  return pool.run({ password, saltRounds }, { name: 'hashPassword' });
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return pool.run({ password, hash }, { name: 'comparePassword' });
}

export async function closePasswordHasherPool(): Promise<void> {
  await pool.destroy();
}
