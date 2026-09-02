import crypto from 'crypto';
import { workerData } from 'worker_threads';
import { argon2id, argon2Verify } from 'hash-wasm';

// Выполняется внутри worker_threads-потока piscina — argon2id здесь безопасно грузит
// event loop именно этого потока, не основного. Каждая функция экспортирована отдельно
// и выбирается вызывающей стороной через `pool.run(task, { name })`.
//
// Параметры — минимум по OWASP Password Storage Cheat Sheet (2023) для argon2id:
// m=19 MiB, t=2, p=1. В отличие от bcrypt (один параметр — cost factor), у argon2id
// память — отдельная, настраиваемая ось защиты (то, чего у bcrypt нет вообще), поэтому
// здесь три константы, а не один "saltRounds"-параметр, как было раньше.
const MEMORY_SIZE_KIB = 19456;
const ITERATIONS = 2;
const PARALLELISM = 1;
const HASH_LENGTH = 32;
const SALT_LENGTH = 16;

// Pepper (паттерн Dropbox, см. их блог о хранении паролей) — HMAC-SHA256 пароля с секретом
// ИЗ КОНФИГА, не из БД, ПЕРЕД argon2id. Соль (сгенерированная ниже) живёт рядом с хешем
// в той же коллекции users и защищает только от rainbow tables — если утечёт вся БД целиком
// (дамп, бэкап, инъекция), соль утекает вместе с хешем. Pepper — отдельный секрет, который
// никогда не покидает application-слой (только .env/секрет-менеджер), поэтому одной утечки
// БД недостаточно для офлайн-брутфорса — нужен ещё и код/конфиг сервера. HMAC, а не наивная
// конкатенация password+pepper — стандартный способ подмешать секретный ключ к сообщению
// без риска атак на конкатенацию (length-extension и подобных).
//
// Секрет приходит через workerData (см. password-hasher.ts), НЕ через собственный import
// config/index.ts внутри этого файла — этот воркер выполняется в настоящем worker_threads-
// потоке со своим отдельным process.env (копия на момент создания Worker'а, не живая ссылка
// на основной процесс). Импорт всего config здесь заново гонял бы ПОЛНУЮ Zod-валидацию
// (JWT/Google/GitHub секреты и т.п., не при чём к хешированию пароля) в этом отдельном
// окружении — локально это маскировалось реальным .env на диске (dotenv успевал дочитать
// файл сам внутри потока), а в CI без .env-файла воркер падал на пустых полях, которые ему
// вообще не нужны. workerData передаётся Piscina явно и не зависит от того, что видно в
// process.env конкретного потока.
const { passwordPepper } = workerData as { passwordPepper: string };

function pepperPassword(password: string): Buffer {
  return crypto.createHmac('sha256', passwordPepper).update(password).digest();
}

export async function hashPassword({ password }: { password: string }): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  // outputType: 'encoded' — самоописывающаяся строка вида $argon2id$v=19$m=...,t=...,p=...$salt$hash,
  // те же параметры хеширования и соль зашиты внутри неё же — argon2Verify() ниже читает их оттуда,
  // отдельно хранить/передавать соль и параметры не нужно (тот же принцип, что и у bcrypt-хешей).
  // На вход argon2id идёт не сырой пароль, а результат pepperPassword() — см. комментарий выше.
  return argon2id({
    password: pepperPassword(password),
    salt,
    iterations: ITERATIONS,
    parallelism: PARALLELISM,
    memorySize: MEMORY_SIZE_KIB,
    hashLength: HASH_LENGTH,
    outputType: 'encoded',
  });
}

export async function comparePassword({ password, hash }: { password: string; hash: string }): Promise<boolean> {
  return argon2Verify({ password: pepperPassword(password), hash });
}
