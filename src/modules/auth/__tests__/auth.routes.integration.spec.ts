import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { UserModel } from 'users/user.model';
import app from '../../../app';

// Полный сквозной прогон через реальный Express (app.ts as is — helmet, cors, rate-limit
// прошедший passthrough в test-окружении, passport, все auth-роуты) и реальный Mongoose
// поверх mongodb-memory-server (см. test/globalSetup.ts, test/setupIntegration.ts).
// В отличие от auth.service.unit.spec.ts (repository замокан) — здесь ничего не мокается,
// кроме почты (transporter не настроен в test-окружении, см. test/setupTestEnv.ts —
// emailService.isConfigured() сама вернёт false, отдельно мокать не нужно).
//
// Именно на этом уровне ловятся баги, которые unit-тесты с замоканным repository
// принципиально не видят — то, что реально происходит на стыке Zod-валидации,
// Mongoose-схемы и MongoDB (ровно как баги №14/№15 из Рефакторинг проблем — они оба живут
// на границе "как ORM реально строит запрос", не в бизнес-логике сервиса).

async function registerVerifiedUser(overrides: { email?: string; password?: string; name?: string } = {}) {
  const email = overrides.email ?? 'verified@example.com';
  const password = overrides.password ?? 'password123';
  const name = overrides.name ?? 'Verified User';

  await request(app).post('/api/auth/register').send({ name, email, password, confirmPassword: password });

  // emailService не настроен в тестах — реального письма не будет, эмулируем переход
  // по ссылке подтверждения напрямую через токен, записанный в БД (тот же путь, что
  // и шпаргалка ручного тестирования проекта использует при недоступном SMTP).
  const user = await UserModel.findOne({ email }).select('+emailVerificationToken');
  if (!user?.emailVerificationToken) {
    throw new Error(`test setup: verification token not found for ${email}`);
  }

  await request(app).post('/api/auth/verify-email').send({ token: user.emailVerificationToken });

  return { email, password, name };
}

describe('Auth routes (integration)', () => {
  describe('POST /api/auth/register', () => {
    describe('Когда данные валидны', () => {
      it('должен создать пользователя с ролью student и не выдать сессию', async () => {
        // When
        const response = await request(app).post('/api/auth/register').send({
          name: 'New User',
          email: 'new@example.com',
          password: 'password123',
          confirmPassword: 'password123',
        });

        // Then
        expect(response.status).toBe(201);
        expect(response.body.user.role).toBe('student');
        expect(response.headers['set-cookie']).toBeUndefined();

        const stored = await UserModel.findOne({ email: 'new@example.com' });
        expect(stored?.isEmailVerified).toBe(false);
      });

      it('роль admin в теле запроса должна игнорироваться сервером', async () => {
        // When
        await request(app).post('/api/auth/register').send({
          name: 'Hacker',
          email: 'hacker@example.com',
          password: 'password123',
          confirmPassword: 'password123',
          role: 'admin',
        });

        // Then
        const stored = await UserModel.findOne({ email: 'hacker@example.com' });
        expect(stored?.role).toBe('student');
      });
    });

    describe('Когда пароли не совпадают', () => {
      it('должен вернуть 400 и не создавать пользователя', async () => {
        // When
        const response = await request(app).post('/api/auth/register').send({
          name: 'Mismatch',
          email: 'mismatch@example.com',
          password: 'password123',
          confirmPassword: 'different-password',
        });

        // Then
        expect(response.status).toBe(400);
        expect(await UserModel.findOne({ email: 'mismatch@example.com' })).toBeNull();
      });
    });

    describe('Когда email уже зарегистрирован', () => {
      it('должен вернуть 409', async () => {
        // Given
        await registerVerifiedUser({ email: 'dup@example.com' });

        // When
        const response = await request(app).post('/api/auth/register').send({
          name: 'Dup Again',
          email: 'dup@example.com',
          password: 'password123',
          confirmPassword: 'password123',
        });

        // Then
        expect(response.status).toBe(409);
      });
    });
  });

  describe('POST /api/auth/login', () => {
    describe('Когда email не подтверждён', () => {
      it('должен вернуть 403, несмотря на верный пароль', async () => {
        // Given
        await request(app).post('/api/auth/register').send({
          name: 'Not Verified',
          email: 'notverified@example.com',
          password: 'password123',
          confirmPassword: 'password123',
        });

        // When
        const response = await request(app)
          .post('/api/auth/login')
          .send({ email: 'notverified@example.com', password: 'password123' });

        // Then
        expect(response.status).toBe(403);
      });
    });

    describe('Когда email подтверждён и пароль верный', () => {
      it('должен выдать httpOnly cookie с access и refresh токенами', async () => {
        // Given
        const { email, password } = await registerVerifiedUser({ email: 'login@example.com' });

        // When
        const response = await request(app).post('/api/auth/login').send({ email, password });

        // Then
        expect(response.status).toBe(200);
        const cookies = response.headers['set-cookie'] as unknown as string[];
        expect(cookies.some(c => c.startsWith('access_token=') && c.includes('HttpOnly'))).toBe(true);
        expect(cookies.some(c => c.startsWith('refresh_token=') && c.includes('HttpOnly'))).toBe(true);
      });
    });

    describe('Когда пароль неверный', () => {
      it('должен вернуть 401', async () => {
        // Given
        const { email } = await registerVerifiedUser({ email: 'wrongpass@example.com' });

        // When
        const response = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });

        // Then
        expect(response.status).toBe(401);
      });
    });
  });

  describe('GET /api/auth/me', () => {
    describe('Когда запрос без cookie', () => {
      it('должен вернуть 401', async () => {
        // When
        const response = await request(app).get('/api/auth/me');

        // Then
        expect(response.status).toBe(401);
      });
    });

    describe('Когда запрос с валидной сессией', () => {
      it('должен вернуть текущего пользователя', async () => {
        // Given
        const { email, password } = await registerVerifiedUser({ email: 'me@example.com', name: 'Me User' });
        const agent = request.agent(app);
        await agent.post('/api/auth/login').send({ email, password });

        // When
        const response = await agent.get('/api/auth/me');

        // Then
        expect(response.status).toBe(200);
        expect(response.body.user.email).toBe(email);
        expect(response.body.user.name).toBe('Me User');
      });
    });
  });

  describe('POST /api/auth/change-password', () => {
    describe('Когда пользователь не аутентифицирован', () => {
      it('должен вернуть 401', async () => {
        // When
        const response = await request(app)
          .post('/api/auth/change-password')
          .send({ currentPassword: 'a', newPassword: 'b', confirmPassword: 'b' });

        // Then
        expect(response.status).toBe(401);
      });
    });

    describe('Когда пользователь аутентифицирован и текущий пароль верный', () => {
      it('должен сменить пароль — новый работает при следующем логине, старый больше нет', async () => {
        // Given
        const { email, password } = await registerVerifiedUser({ email: 'changepw@example.com' });
        const agent = request.agent(app);
        await agent.post('/api/auth/login').send({ email, password });

        // When
        const changeResponse = await agent
          .post('/api/auth/change-password')
          .send({ currentPassword: password, newPassword: 'new-password123', confirmPassword: 'new-password123' });

        // Then
        expect(changeResponse.status).toBe(200);

        const oldLoginResponse = await request(app).post('/api/auth/login').send({ email, password });
        expect(oldLoginResponse.status).toBe(401);

        const newLoginResponse = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'new-password123' });
        expect(newLoginResponse.status).toBe(200);
      });
    });
  });

  describe('POST /api/auth/refresh', () => {
    describe('Когда refresh-токен из cookie валиден', () => {
      it('должен выдать новую пару токенов, которой можно пройти /me', async () => {
        // Given
        const { email, password } = await registerVerifiedUser({ email: 'refresh@example.com' });
        const agent = request.agent(app);
        await agent.post('/api/auth/login').send({ email, password });

        // When — не сравниваем строку токена с предыдущей: jwt.sign детерминирован при
        // одинаковом payload (включая iat с точностью до секунды), login и refresh внутри
        // одного теста стабильно укладываются в одну секунду, так что новый access-токен
        // может побайтово совпасть со старым — это не баг, а следствие отсутствия jti
        // (случайного nonce) в payload, а не то, что refresh() реально ничего не обновил.
        const refreshResponse = await agent.post('/api/auth/refresh').send();

        // Then
        expect(refreshResponse.status).toBe(200);
        const newCookies = refreshResponse.headers['set-cookie'] as unknown as string[];
        expect(newCookies.some(c => c.startsWith('access_token=') && c.includes('HttpOnly'))).toBe(true);

        const meResponse = await agent.get('/api/auth/me');
        expect(meResponse.status).toBe(200);
        expect(meResponse.body.user.email).toBe(email);
      });
    });

    describe('Когда refresh-токен отсутствует', () => {
      it('должен вернуть 401', async () => {
        // When
        const response = await request(app).post('/api/auth/refresh').send();

        // Then
        expect(response.status).toBe(401);
      });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('должен очистить cookie токенов', async () => {
      // Given
      const { email, password } = await registerVerifiedUser({ email: 'logout@example.com' });
      const agent = request.agent(app);
      await agent.post('/api/auth/login').send({ email, password });

      // When
      const response = await agent.post('/api/auth/logout');

      // Then
      expect(response.status).toBe(200);
      const meResponse = await agent.get('/api/auth/me');
      expect(meResponse.status).toBe(401);
    });
  });

  describe('PATCH /api/auth/profile', () => {
    describe('Когда пользователь не аутентифицирован', () => {
      it('должен вернуть 401', async () => {
        // When
        const response = await request(app).patch('/api/auth/profile').send({ name: 'New Name' });

        // Then
        expect(response.status).toBe(401);
      });
    });

    describe('Когда передано новое имя', () => {
      it('должен обновить профиль и сохранить изменение в БД', async () => {
        // Given
        const { email, password } = await registerVerifiedUser({ email: 'profile@example.com' });
        const agent = request.agent(app);
        await agent.post('/api/auth/login').send({ email, password });

        // When
        const response = await agent.patch('/api/auth/profile').send({ name: 'Updated Name' });

        // Then
        expect(response.status).toBe(200);
        expect(response.body.user.name).toBe('Updated Name');

        const stored = await UserModel.findOne({ email });
        expect(stored?.name).toBe('Updated Name');
      });
    });

    describe('Когда тело запроса пустое', () => {
      it('должен вернуть 400 — нечего обновлять', async () => {
        // Given
        const { email, password } = await registerVerifiedUser({ email: 'emptyprofile@example.com' });
        const agent = request.agent(app);
        await agent.post('/api/auth/login').send({ email, password });

        // When
        const response = await agent.patch('/api/auth/profile').send({});

        // Then
        expect(response.status).toBe(400);
      });
    });
  });

  describe('POST /api/auth/resend-verification', () => {
    describe('Когда email не зарегистрирован', () => {
      it('должен ответить 200 тихо, не спалив факт отсутствия аккаунта', async () => {
        // When
        const response = await request(app).post('/api/auth/resend-verification').send({ email: 'ghost@example.com' });

        // Then
        expect(response.status).toBe(200);
      });
    });

    describe('Когда пользователь зарегистрирован, но email не подтверждён', () => {
      it('должен ответить 200 и выдать новый токен подтверждения', async () => {
        // Given
        const email = 'resend@example.com';
        await request(app)
          .post('/api/auth/register')
          .send({ name: 'Resend Me', email, password: 'password123', confirmPassword: 'password123' });
        const before = await UserModel.findOne({ email }).select('+emailVerificationToken');

        // When
        const response = await request(app).post('/api/auth/resend-verification').send({ email });

        // Then
        expect(response.status).toBe(200);
        const after = await UserModel.findOne({ email }).select('+emailVerificationToken');
        expect(after?.emailVerificationToken).not.toBe(before?.emailVerificationToken);
      });
    });
  });

  describe('POST /api/auth/request-password-reset и POST /api/auth/reset-password', () => {
    describe('Сквозной сценарий: запрос сброса → сброс по токену → вход с новым паролем', () => {
      it('должен позволить сменить пароль без знания старого', async () => {
        // Given
        const { email } = await registerVerifiedUser({ email: 'forgot@example.com', password: 'old-password123' });

        // When — запрос токена сброса
        const requestResponse = await request(app).post('/api/auth/request-password-reset').send({ email });
        expect(requestResponse.status).toBe(200);

        const userWithToken = await UserModel.findOne({ email }).select('+passwordResetToken');
        const resetToken = userWithToken?.passwordResetToken;
        if (!resetToken) {
          throw new Error('test setup: password reset token not found');
        }

        // When — сброс пароля по токену
        const resetResponse = await request(app)
          .post('/api/auth/reset-password')
          .send({ token: resetToken, newPassword: 'brand-new-password123', confirmPassword: 'brand-new-password123' });

        // Then
        expect(resetResponse.status).toBe(200);

        const oldPasswordLogin = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'old-password123' });
        expect(oldPasswordLogin.status).toBe(401);

        const newPasswordLogin = await request(app)
          .post('/api/auth/login')
          .send({ email, password: 'brand-new-password123' });
        expect(newPasswordLogin.status).toBe(200);
      });
    });

    describe('Когда токен сброса невалиден', () => {
      it('должен вернуть 400', async () => {
        // When
        const response = await request(app)
          .post('/api/auth/reset-password')
          .send({ token: 'garbage-token', newPassword: 'password123', confirmPassword: 'password123' });

        // Then
        expect(response.status).toBe(400);
      });
    });
  });
});
