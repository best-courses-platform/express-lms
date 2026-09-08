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

// Для проверок реального отзыва refresh-сессии на сервере — нужно вручную предъявить
// СТАРОЕ значение cookie уже ПОСЛЕ того, как agent сам переключился на новое (ротация)
// или agent вообще перестал слать cookie (logout, clearCookie). supertest.agent хранит
// только текущее состояние своей cookie jar, старое значение из неё не достать —
// вытаскиваем прямо из Set-Cookie заголовка того ответа, где оно было выдано.
function extractCookieValue(response: request.Response, name: string): string {
  const cookies = response.headers['set-cookie'] as unknown as string[];
  const cookie = cookies?.find(c => c.startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(`test setup: cookie "${name}" not found in response`);
  }
  return cookie.split(';')[0].split('=')[1];
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

  describe('POST /api/auth/login/local', () => {
    describe('Когда email не подтверждён', () => {
      it('должен вернуть 403, не выдавая сессию (регрессия — тот же путь, что и /login, должен требовать то же самое)', async () => {
        // Given — этот роут идёт через passport localAuth -> local.strategy.ts ->
        // authService.authenticate() напрямую, а НЕ через authService.login() (как /login),
        // а именно authService.login() — единственное место, где проверяется isEmailVerified.
        // handleLoginSuccess, вызываемый после localAuth, тоже такой проверки не делает —
        // до фикса этот роут выдавал полноценную сессию непроверенному email, тем же классом
        // проблемы, что и баг №9 ("register() выдавал сессию до подтверждения email"), только
        // через другой, менее очевидный вход.
        await request(app).post('/api/auth/register').send({
          name: 'Not Verified Local',
          email: 'notverified-local@example.com',
          password: 'password123',
          confirmPassword: 'password123',
        });

        // When
        const response = await request(app)
          .post('/api/auth/login/local')
          .send({ email: 'notverified-local@example.com', password: 'password123' });

        // Then
        expect(response.status).toBe(403);
        expect(response.headers['set-cookie']).toBeUndefined();
      });
    });

    describe('Когда email подтверждён и пароль верный', () => {
      it('должен выдать httpOnly cookie с access и refresh токенами', async () => {
        // Given
        const { email, password } = await registerVerifiedUser({ email: 'login-local@example.com' });

        // When
        const response = await request(app).post('/api/auth/login/local').send({ email, password });

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
        const { email } = await registerVerifiedUser({ email: 'wrongpass-local@example.com' });

        // When
        const response = await request(app)
          .post('/api/auth/login/local')
          .send({ email, password: 'wrong-password' });

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

    describe('Когда есть вторая активная сессия на другом устройстве', () => {
      it('должна пощадить текущую (сменившую пароль) сессию и отозвать другую', async () => {
        // Given — два разных agent = две разные refresh-сессии одного пользователя,
        // тот же принцип, что и loginAgent на два устройства в других модулях.
        const { email, password } = await registerVerifiedUser({ email: 'multi-session-changepw@example.com' });
        const agentA = request.agent(app);
        const agentB = request.agent(app);
        await agentA.post('/api/auth/login').send({ email, password });
        await agentB.post('/api/auth/login').send({ email, password });

        // When
        const changeResponse = await agentA.post('/api/auth/change-password').send({
          currentPassword: password,
          newPassword: 'new-password456',
          confirmPassword: 'new-password456',
        });
        expect(changeResponse.status).toBe(200);

        // Then — паттерн GitHub/Google: сессия, которая сама сменила пароль, не считается
        // подозрительной и не отзывается вместе с остальными.
        const ownRefresh = await agentA.post('/api/auth/refresh');
        expect(ownRefresh.status).toBe(200);

        const otherRefresh = await agentB.post('/api/auth/refresh');
        expect(otherRefresh.status).toBe(401);
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

    describe('Когда refresh-токен уже провёрнут и предъявлен ПОВТОРНО СРАЗУ ЖЕ (гонка, не кража)', () => {
      it('должен вернуть 401 на старый, но НЕ гасить семью — легитимный потомок остаётся живым', async () => {
        // Given
        const { email, password } = await registerVerifiedUser({ email: 'race-refresh@example.com' });
        const agent = request.agent(app);
        const loginResponse = await agent.post('/api/auth/login').send({ email, password });
        const oldRefreshCookie = extractCookieValue(loginResponse, 'refresh_token');

        // When — agent проворачивает токен (это и есть "победитель гонки"), затем СТАРЫЙ
        // (уже провёрнутый) предъявляется отдельно, в пределах ROTATION_GRACE_MS.
        await agent.post('/api/auth/refresh');
        const raceResponse = await request(app)
          .post('/api/auth/refresh')
          .set('Cookie', `refresh_token=${oldRefreshCookie}`);

        // Then
        expect(raceResponse.status).toBe(401);
        const legitResponse = await agent.post('/api/auth/refresh');
        expect(legitResponse.status).toBe(200);
      });
    });
  });

  describe('После POST /api/auth/logout', () => {
    it('старый refresh-токен должен быть недействителен на сервере, не только вычищен из cookie клиента', async () => {
      // Given — раньше logout ничего не делал на сервере (см. Обзор/25 в портфолио):
      // тест на "/me после logout — 401" проходил ложно, просто потому что agent сам
      // прекращал слать уже вычищенную cookie. Здесь сознательно НЕ через agent —
      // сохранённое значение имитирует клиента, который не выполнил clearCookie у себя
      // (или скопировал токен раньше) — именно этот случай раньше проходил бы как есть.
      const { email, password } = await registerVerifiedUser({ email: 'logout-then-refresh@example.com' });
      const agent = request.agent(app);
      const loginResponse = await agent.post('/api/auth/login').send({ email, password });
      const oldRefreshCookie = extractCookieValue(loginResponse, 'refresh_token');

      // When
      await agent.post('/api/auth/logout');
      const response = await request(app).post('/api/auth/refresh').set('Cookie', `refresh_token=${oldRefreshCookie}`);

      // Then
      expect(response.status).toBe(401);
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

    describe('Когда на момент сброса была активная сессия', () => {
      it('должен отозвать её без исключений — в отличие от change-password, щадить здесь нечего', async () => {
        // Given — в момент сброса пользователь не аутентифицирован ни в одной сессии
        // (сброс идёт по email-токену, не по cookie), поэтому, в отличие от
        // change-password, exceptSessionId здесь в принципе не может появиться.
        const { email, password } = await registerVerifiedUser({ email: 'session-then-reset@example.com' });
        const agent = request.agent(app);
        await agent.post('/api/auth/login').send({ email, password });

        // When
        await request(app).post('/api/auth/request-password-reset').send({ email });
        const userWithToken = await UserModel.findOne({ email }).select('+passwordResetToken');
        const resetToken = userWithToken?.passwordResetToken;
        if (!resetToken) {
          throw new Error('test setup: password reset token not found');
        }
        await request(app)
          .post('/api/auth/reset-password')
          .send({ token: resetToken, newPassword: 'brand-new-password789', confirmPassword: 'brand-new-password789' });

        // Then
        const refreshResponse = await agent.post('/api/auth/refresh');
        expect(refreshResponse.status).toBe(401);
      });
    });
  });

  describe('GET /api/auth/sessions', () => {
    it('должен вернуть только свои активные сессии, с current: true у текущей', async () => {
      // Given
      const { email, password } = await registerVerifiedUser({ email: 'list-sessions@example.com' });
      const agentA = request.agent(app);
      const agentB = request.agent(app);
      await agentA.post('/api/auth/login').send({ email, password });
      await agentB.post('/api/auth/login').send({ email, password });

      // When
      const response = await agentA.get('/api/auth/sessions');

      // Then
      expect(response.status).toBe(200);
      expect(response.body.sessions).toHaveLength(2);
      const current = response.body.sessions.find((s: { current: boolean }) => s.current);
      expect(current).toBeDefined();
      expect(response.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    });

    it('не должен отдавать чужие сессии другого пользователя', async () => {
      // Given
      const userA = await registerVerifiedUser({ email: 'sessions-owner@example.com' });
      const userB = await registerVerifiedUser({ email: 'sessions-stranger@example.com' });
      const agentA = request.agent(app);
      const agentB = request.agent(app);
      await agentA.post('/api/auth/login').send({ email: userA.email, password: userA.password });
      await agentB.post('/api/auth/login').send({ email: userB.email, password: userB.password });

      // When
      const response = await agentB.get('/api/auth/sessions');

      // Then
      expect(response.status).toBe(200);
      expect(response.body.sessions).toHaveLength(1);
    });
  });

  describe('DELETE /api/auth/sessions/:id', () => {
    describe('Когда сессия своя', () => {
      it('должен отозвать её (204), после чего refresh с ней невозможен', async () => {
        // Given
        const { email, password } = await registerVerifiedUser({ email: 'delete-own-session@example.com' });
        const agentA = request.agent(app);
        const agentB = request.agent(app);
        await agentA.post('/api/auth/login').send({ email, password });
        await agentB.post('/api/auth/login').send({ email, password });

        const sessions = await agentA.get('/api/auth/sessions');
        const otherSessionId = sessions.body.sessions.find((s: { current: boolean }) => !s.current).id;

        // When — agentA отзывает сессию agentB через свой собственный список (тот же
        // владелец, чужое устройство — ровно кейс "выйти с другого устройства из UI").
        const deleteResponse = await agentA.delete(`/api/auth/sessions/${otherSessionId}`);

        // Then
        expect(deleteResponse.status).toBe(204);
        const refreshResponse = await agentB.post('/api/auth/refresh');
        expect(refreshResponse.status).toBe(401);
      });
    });

    describe('Когда сессия чужая (принадлежит другому пользователю)', () => {
      it('должен вернуть 404, не трогая сессию', async () => {
        // Given
        const userA = await registerVerifiedUser({ email: 'delete-foreign-a@example.com' });
        const userB = await registerVerifiedUser({ email: 'delete-foreign-b@example.com' });
        const agentA = request.agent(app);
        const agentB = request.agent(app);
        await agentA.post('/api/auth/login').send({ email: userA.email, password: userA.password });
        await agentB.post('/api/auth/login').send({ email: userB.email, password: userB.password });

        const sessionsB = await agentB.get('/api/auth/sessions');
        const targetSessionId = sessionsB.body.sessions[0].id;

        // When — agentA пытается удалить сессию, принадлежащую userB
        const deleteResponse = await agentA.delete(`/api/auth/sessions/${targetSessionId}`);

        // Then
        expect(deleteResponse.status).toBe(404);
        const refreshResponse = await agentB.post('/api/auth/refresh');
        expect(refreshResponse.status).toBe(200);
      });
    });

    describe('Когда id синтаксически не ObjectId', () => {
      it('должен вернуть 400, не 500', async () => {
        // Given
        const { email, password } = await registerVerifiedUser({ email: 'delete-bad-id@example.com' });
        const agent = request.agent(app);
        await agent.post('/api/auth/login').send({ email, password });

        // When
        const response = await agent.delete('/api/auth/sessions/not-an-object-id');

        // Then
        expect(response.status).toBe(400);
      });
    });
  });

  describe('POST /api/auth/logout-all', () => {
    it('должен отозвать вообще все сессии пользователя, включая ту, с которой вызван', async () => {
      // Given
      const { email, password } = await registerVerifiedUser({ email: 'logout-all@example.com' });
      const agentA = request.agent(app);
      const agentB = request.agent(app);
      await agentA.post('/api/auth/login').send({ email, password });
      await agentB.post('/api/auth/login').send({ email, password });

      // When
      const response = await agentA.post('/api/auth/logout-all');

      // Then
      expect(response.status).toBe(200);
      const refreshA = await agentA.post('/api/auth/refresh');
      expect(refreshA.status).toBe(401);
      const refreshB = await agentB.post('/api/auth/refresh');
      expect(refreshB.status).toBe(401);
    });
  });
});
