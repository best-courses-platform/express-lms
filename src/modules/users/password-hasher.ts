import path from 'path';
import Piscina from 'piscina';
import { ServiceUnavailableError } from '../../utils/errors';
import { USER_MESSAGES } from './user.constants';
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
  // password-hasher.worker.ts — реальный обжёгшийся вариант: воркер выполняется в настоящем
  // worker_threads-потоке со своим отдельным process.env (Node docs: "env — Default:
  // process.env", копия на момент создания Worker'а, не живая ссылка на env основного
  // процесса) — если бы воркер сам импортировал config, он заново гонял бы ПОЛНУЮ
  // Zod-валидацию (JWT/Google/GitHub секреты и т.д., совершенно не при чём к хешированию
  // пароля) в этом отдельном окружении. Локально это маскировалось реальным .env на диске
  // (dotenv.config() внутри воркера успешно дочитывал файл сам) — в CI/проде без .env файла
  // (переменные приходят через process.env хоста, не через файл) воркер падал на пустых
  // googleClientId/jwtSecret и т.п., хотя ему нужен только один-единственный пароль-pepper.
  // workerData — то, что Piscina/Node передаёт КАЖДОМУ потоку явно и надёжно, в обход
  // вопроса "какой у него process.env" целиком.
  workerData: { passwordPepper: config.passwordPepper },
  // По умолчанию у Piscina maxQueue: Infinity — очередь задач ничем не ограничена. argon2id
  // (как и раньше bcrypt) — намеренно дорогая CPU-bound операция; без верхней границы поток
  // запросов на регистрацию/логин быстрее, чем пул успевает их хешировать (флуд с одного
  // источника или просто реальный всплеск нагрузки), не деградирует контролируемо, а копит
  // неограниченно растущую очередь — задержка ответа расползается на минуты, память процесса
  // растёт, ничего явно не падает, просто становится всё медленнее для всех. 'auto' — то же
  // значение, которое Piscina сама предлагает как разумный дефолт (maxThreads ** 2): когда
  // очередь переполнена, pool.run() сразу же отклоняет новую задачу вместо того, чтобы
  // копить её бесконечно — см. hashPassword/comparePassword ниже, которые превращают этот
  // отказ в понятный 503 клиенту, а не в тихо растущую задержку.
  maxQueue: 'auto',
});

// Piscina не даёт отдельного класса ошибки/кода для переполнения очереди (см. её errors.ts) —
// только текст сообщения, поэтому матчим по нему. Ложное срабатывание маловероятно (никакой
// другой код в этом пуле не бросает Error с таким же текстом), а цена ошибки — просто
// InternalError(500) вместо ServiceUnavailableError(503) в редком крайнем случае, не потеря
// данных и не тихий сбой.
function isPoolOverloadedError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Task queue is at limit';
}

export async function hashPassword(password: string): Promise<string> {
  try {
    return await pool.run({ password }, { name: 'hashPassword' });
  } catch (error) {
    if (isPoolOverloadedError(error)) {
      throw new ServiceUnavailableError(USER_MESSAGES.ERROR.HASHING_SERVICE_BUSY);
    }
    throw error;
  }
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  try {
    return await pool.run({ password, hash }, { name: 'comparePassword' });
  } catch (error) {
    if (isPoolOverloadedError(error)) {
      throw new ServiceUnavailableError(USER_MESSAGES.ERROR.HASHING_SERVICE_BUSY);
    }
    throw error;
  }
}

export async function closePasswordHasherPool(): Promise<void> {
  await pool.destroy();
}
