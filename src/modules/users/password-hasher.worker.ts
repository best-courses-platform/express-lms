import bcrypt from 'bcryptjs';

// Выполняется внутри worker_threads-потока piscina — bcryptjs здесь безопасно грузит
// event loop именно этого потока, не основного. Каждая функция экспортирована отдельно
// и выбирается вызывающей стороной через `pool.run(task, { name })`.

export async function hashPassword({ password, saltRounds }: { password: string; saltRounds: number }): Promise<string> {
  const salt = await bcrypt.genSalt(saltRounds);
  return bcrypt.hash(password, salt);
}

export async function comparePassword({ password, hash }: { password: string; hash: string }): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
