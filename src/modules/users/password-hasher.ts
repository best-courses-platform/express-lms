import path from 'path';
import Piscina from 'piscina';
import { config } from '../../config';

// В dev/тестах процесс запускается через tsx/@swc-jest, а не `node dist/*.js` — __filename
// у скомпилированного кода сохраняет .ts. Worker-поток стартует как отдельный процесс без
// автоматической TS-транспиляции, поэтому в этом случае явно грузим ts-исходник воркера и
// регистрируем tsx как CJS require-хук (`-r tsx/cjs`) именно в этом потоке. В проде
// (`node dist/server.js`) __filename уже .js — воркер и так обычный CommonJS, хук не нужен.
const isTsRuntime = __filename.endsWith('.ts');

const pool = new Piscina({
  filename: path.resolve(__dirname, isTsRuntime ? 'password-hasher.worker.ts' : 'password-hasher.worker.js'),
  execArgv: isTsRuntime ? ['-r', 'tsx/cjs'] : [],
  // Пул при старте потока прогревает хендлер с именем 'default' (дефолт Piscina, если
  // не указать name явно) — в этом воркере только именованные экспорты (hashPassword,
  // comparePassword), default-экспорта нет. require(filename) успешно грузит модуль, но
  // handler['default'] === undefined, и Piscina считает это "не нашли через require",
  // падая в ESM-фолбэк (import()). Для .ts-файла на Node без нативной поддержки TS в ESM
  // (Node 20, см. .nvmrc — версия проекта) это ERR_UNKNOWN_FILE_EXTENSION, крашащий поток
  // ещё на старте, до обработки первой реальной задачи. На новых Node (22.6+/23.6+/24,
  // экспериментальный/дефолтный type-stripping в ESM-загрузчике) фолбэк тихо не падает —
  // отсюда расхождение поведения между версиями Node. Название любого реального экспорта
  // здесь просто устраняет сам повод для фолбэка; реальные вызовы (hashPassword/
  // comparePassword через pool.run(..., { name })) он не затрагивает.
  name: 'hashPassword',
  // Без этого пул держит потоки живыми бесконечно даже без задач — процесс (и jest после
  // тестов) не завершался бы сам по себе, пришлось бы отдельно звать pool.destroy() везде.
  idleTimeout: 30000,
  // Явная передача pepper'а через workerData, а не импорт всего config/index.ts ВНУТРИ
  // password-hasher.worker.ts — воркер выполняется в настоящем worker_threads-потоке со
  // своим отдельным process.env (Node docs: "env — Default: process.env", копия на момент
  // создания Worker'а, не живая ссылка на env основного процесса) — если бы воркер сам
  // импортировал config, он заново гонял бы ПОЛНУЮ Zod-валидацию (JWT/Google/GitHub секреты
  // и т.д., совершенно не при чём к хешированию пароля) в этом отдельном окружении.
  // workerData — то, что Piscina/Node передаёт КАЖДОМУ потоку явно и надёжно, в обход
  // вопроса "какой у него process.env" целиком.
  workerData: { passwordPepper: config.passwordPepper },
});

export async function hashPassword(password: string): Promise<string> {
  return pool.run({ password }, { name: 'hashPassword' });
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return pool.run({ password, hash }, { name: 'comparePassword' });
}

export async function closePasswordHasherPool(): Promise<void> {
  await pool.destroy();
}
