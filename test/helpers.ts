import request from 'supertest';
import type { Express } from 'express';
import { UserModel } from 'users/user.model';
import type { UserRole } from 'users/user.types';

// Общий помощник для интеграционных тестов любого модуля, которому нужен залогиненный
// пользователь: регистрация (роль всегда 'student' — сервер её жёстко проставляет, см.
// authService.register) → подтверждение email напрямую по токену из БД (SMTP не настроен
// в тестах, см. test/setupTestEnv.ts) → опциональное повышение роли напрямую в БД, тем же
// путём, что описан в шпаргалке ручного тестирования проекта (mongosh $set role).
export async function registerVerifiedUser(
  app: Express,
  overrides: { email?: string; password?: string; name?: string; role?: UserRole } = {}
): Promise<{ email: string; password: string; name: string }> {
  const email = overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = overrides.password ?? 'password123';
  const name = overrides.name ?? 'Test User';

  await request(app).post('/api/auth/register').send({ name, email, password, confirmPassword: password });

  const user = await UserModel.findOne({ email }).select('+emailVerificationToken');
  if (!user?.emailVerificationToken) {
    throw new Error(`test setup: verification token not found for ${email}`);
  }
  await request(app).post('/api/auth/verify-email').send({ token: user.emailVerificationToken });

  if (overrides.role && overrides.role !== 'student') {
    await UserModel.updateOne({ email }, { $set: { role: overrides.role } });
  }

  return { email, password, name };
}

// agent уже залогинен под нужной ролью — минимизирует бойлерплейт login() в каждом тесте.
export async function loginAgent(
  app: Express,
  overrides: { email?: string; password?: string; name?: string; role?: UserRole } = {}
) {
  const { email, password, name } = await registerVerifiedUser(app, overrides);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  return { agent, email, password, name };
}

// Тестовые сценарии часто регистрируют пользователя через HTTP (registerVerifiedUser/
// loginAgent), а затем достают его же документ напрямую из БД (например, чтобы получить
// _id для allowed-users) — findOne типизирован как X | null, хотя в контексте теста
// "только что зарегистрированного пользователя нет" означает сломанный setup, не
// легитимный сценарий. Явный throw вместо `!`/`?.` — падает с понятным сообщением
// точно на месте, а не NPE-строкой ниже по тесту.
export async function mustFindUserByEmail(email: string) {
  const user = await UserModel.findOne({ email });
  if (!user) {
    throw new Error(`test setup: user not found for ${email}`);
  }
  return user;
}
