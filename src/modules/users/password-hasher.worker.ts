import crypto from 'crypto';
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

export async function hashPassword({ password }: { password: string }): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  // outputType: 'encoded' — самоописывающаяся строка вида $argon2id$v=19$m=...,t=...,p=...$salt$hash,
  // те же параметры хеширования и соль зашиты внутри неё же — argon2Verify() ниже читает их оттуда,
  // отдельно хранить/передавать соль и параметры не нужно (тот же принцип, что и у bcrypt-хешей).
  return argon2id({
    password,
    salt,
    iterations: ITERATIONS,
    parallelism: PARALLELISM,
    memorySize: MEMORY_SIZE_KIB,
    hashLength: HASH_LENGTH,
    outputType: 'encoded',
  });
}

export async function comparePassword({ password, hash }: { password: string; hash: string }): Promise<boolean> {
  return argon2Verify({ password, hash });
}
