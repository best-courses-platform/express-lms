import { describe, it, expect } from '@jest/globals';
import { closePasswordHasherPool } from '../password-hasher';

// hashPassword/comparePassword уже покрыты интеграционными тестами auth/users — реальная
// регистрация и логин идут через тот же пул воркеров. Здесь — то, что больше нигде не
// покрыто: закрытие пула, вызываемое в проде из SIGINT-хендлера server.ts (сам server.ts
// исключён из coverage, см. jest.config.js — collectCoverageFrom).
describe('password-hasher — закрытие пула', () => {
  it('closePasswordHasherPool закрывает пул воркеров без ошибок', async () => {
    await expect(closePasswordHasherPool()).resolves.toBeUndefined();
  });
});
