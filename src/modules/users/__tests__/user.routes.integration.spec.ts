import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { UserModel } from '../user.model';
import app from '../../../app';
import { loginAgent, mustFindUserByEmail } from '../../../../test/helpers';

// Полный сквозной прогон: реальный Express + реальный Mongoose поверх mongodb-memory-server.
// Весь модуль users/* доступен только роли admin (см. user.routes.ts) — в отличие от
// courses/lessons здесь нет отдельного author-пути, только 401/403/admin.
// EMAIL_USER пуст (test/setupTestEnv.ts) — emailService.isConfigured() === false, письма
// подтверждения при создании/смене email реально не отправляются, мокать email.service не нужно.

function newUserPayload(overrides: Partial<{ name: string; email: string; password: string; role: string }> = {}) {
  const password = overrides.password ?? 'password123';
  return {
    name: overrides.name ?? 'New User',
    email: overrides.email ?? `admin-created-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    password,
    confirmPassword: password,
    role: overrides.role,
  };
}

describe('User routes (integration)', () => {
  describe('POST /api/users', () => {
    describe('Когда запрос без авторизации', () => {
      it('должен вернуть 401', async () => {
        const response = await request(app).post('/api/users').send(newUserPayload());
        expect(response.status).toBe(401);
      });
    });

    describe('Когда пользователь с ролью student', () => {
      it('должен вернуть 403', async () => {
        const { agent } = await loginAgent(app, { role: 'student' });

        const response = await agent.post('/api/users').send(newUserPayload());

        expect(response.status).toBe(403);
      });
    });

    describe('Когда пользователь с ролью author', () => {
      it('должен вернуть 403 — создавать пользователей может только admin', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });

        const response = await agent.post('/api/users').send(newUserPayload());

        expect(response.status).toBe(403);
      });
    });

    describe('Когда пользователь с ролью admin', () => {
      it('должен создать пользователя и не вернуть password в ответе', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });

        const response = await agent.post('/api/users').send(newUserPayload({ email: 'created-by-admin@example.com' }));

        expect(response.status).toBe(201);
        expect(response.body.user.email).toBe('created-by-admin@example.com');
        expect(response.body.user.password).toBeUndefined();

        const stored = await UserModel.findOne({ email: 'created-by-admin@example.com' }).select('+password');
        expect(stored?.password).toEqual(expect.any(String));
      });

      it('должен вернуть 409 при попытке создать пользователя с уже занятым email', async () => {
        // Given
        const { agent } = await loginAgent(app, { role: 'admin' });
        await agent.post('/api/users').send(newUserPayload({ email: 'dup-admin@example.com' }));

        // When
        const response = await agent.post('/api/users').send(newUserPayload({ email: 'dup-admin@example.com' }));

        // Then
        expect(response.status).toBe(409);
      });

      it('должен вернуть 400, если password и confirmPassword не совпадают', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });

        const response = await agent.post('/api/users').send({
          name: 'X',
          email: 'mismatch@example.com',
          password: 'password123',
          confirmPassword: 'different123',
        });

        expect(response.status).toBe(400);
      });

      it('роль из тела запроса применяется явно, если её передал admin', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });

        const response = await agent
          .post('/api/users')
          .send(newUserPayload({ email: 'author-created@example.com', role: 'author' }));

        expect(response.status).toBe(201);
        expect(response.body.user.role).toBe('author');
      });
    });
  });

  describe('GET /api/users', () => {
    describe('Когда запрос без авторизации', () => {
      it('должен вернуть 401', async () => {
        const response = await request(app).get('/api/users');
        expect(response.status).toBe(401);
      });
    });

    describe('Когда пользователь с ролью student', () => {
      it('должен вернуть 403', async () => {
        const { agent } = await loginAgent(app, { role: 'student' });

        const response = await agent.get('/api/users');

        expect(response.status).toBe(403);
      });
    });

    describe('Когда пользователь с ролью admin', () => {
      it('должен вернуть список пользователей без поля password', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });
        await loginAgent(app, { role: 'student' });

        const response = await agent.get('/api/users');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThanOrEqual(2);
        for (const user of response.body) {
          expect(user.password).toBeUndefined();
        }
      });
    });
  });

  describe('GET /api/users/:id', () => {
    describe('Когда запрос без авторизации', () => {
      it('должен вернуть 401', async () => {
        const response = await request(app).get('/api/users/507f1f77bcf86cd799439011');
        expect(response.status).toBe(401);
      });
    });

    describe('Когда пользователь с ролью student', () => {
      it('должен вернуть 403, даже запрашивая свой собственный id', async () => {
        const { agent, email } = await loginAgent(app, { role: 'student' });
        const self = await mustFindUserByEmail(email);

        const response = await agent.get(`/api/users/${self._id.toString()}`);

        expect(response.status).toBe(403);
      });
    });

    describe('Когда пользователь с ролью admin', () => {
      it('должен вернуть 404 для несуществующего id', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });

        const response = await agent.get('/api/users/507f1f77bcf86cd799439011');

        expect(response.status).toBe(404);
      });

      it('должен вернуть пользователя по id без поля password', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });
        const { email: targetEmail } = await loginAgent(app, { role: 'student' });
        const target = await mustFindUserByEmail(targetEmail);

        const response = await agent.get(`/api/users/${target._id.toString()}`);

        expect(response.status).toBe(200);
        expect(response.body.email).toBe(targetEmail);
        expect(response.body.password).toBeUndefined();
      });
    });
  });

  describe('PATCH /api/users/:id', () => {
    describe('Когда запрос без авторизации', () => {
      it('должен вернуть 401', async () => {
        const response = await request(app).patch('/api/users/507f1f77bcf86cd799439011').send({ name: 'X' });
        expect(response.status).toBe(401);
      });
    });

    describe('Когда пользователь с ролью student', () => {
      it('должен вернуть 403, даже обновляя свой собственный профиль', async () => {
        const { agent, email } = await loginAgent(app, { role: 'student' });
        const self = await mustFindUserByEmail(email);

        const response = await agent.patch(`/api/users/${self._id.toString()}`).send({ name: 'Hacked Name' });

        expect(response.status).toBe(403);
      });
    });

    describe('Когда пользователь с ролью admin', () => {
      it('должен вернуть 404 для несуществующего id', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });

        const response = await agent.patch('/api/users/507f1f77bcf86cd799439011').send({ name: 'X' });

        expect(response.status).toBe(404);
      });

      it('должен вернуть 400 при пустом теле запроса (ни одного поля)', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });
        const { email: targetEmail } = await loginAgent(app, { role: 'student' });
        const target = await mustFindUserByEmail(targetEmail);

        const response = await agent.patch(`/api/users/${target._id.toString()}`).send({});

        expect(response.status).toBe(400);
      });

      it('должен обновить имя пользователя', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });
        const { email: targetEmail } = await loginAgent(app, { role: 'student' });
        const target = await mustFindUserByEmail(targetEmail);

        const response = await agent.patch(`/api/users/${target._id.toString()}`).send({ name: 'Updated Name' });

        expect(response.status).toBe(200);
        expect(response.body.user.name).toBe('Updated Name');
      });

      it('не должен сбрасывать роль на student, если role не указан в PATCH (регрессия — Zod .partial()+.default())', async () => {
        // Given — регрессия на баг, ранее найденный и исправленный в course.schema.ts/
        // lesson.schema.ts: updateUserSchema строился через userBaseSchema.partial(), а
        // userBaseSchema.role имеет .default('student') — PATCH без явного role тихо
        // понижал бы автора/админа до student.
        const { agent } = await loginAgent(app, { role: 'admin' });
        const { email: authorEmail } = await loginAgent(app, { role: 'author' });
        const author = await mustFindUserByEmail(authorEmail);

        // When
        const response = await agent.patch(`/api/users/${author._id.toString()}`).send({ name: 'Renamed Author' });

        // Then
        expect(response.status).toBe(200);
        expect(response.body.user.role).toBe('author');

        const stored = await UserModel.findById(author._id);
        expect(stored?.role).toBe('author');
      });

      it('должен изменить роль пользователя', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });
        const { email: targetEmail } = await loginAgent(app, { role: 'student' });
        const target = await mustFindUserByEmail(targetEmail);

        const response = await agent.patch(`/api/users/${target._id.toString()}`).send({ role: 'author' });

        expect(response.status).toBe(200);
        expect(response.body.user.role).toBe('author');
      });

      describe('Когда меняется email на уже занятый другим пользователем', () => {
        it('должен вернуть 409, не обновляя пользователя', async () => {
          const { agent } = await loginAgent(app, { role: 'admin' });
          await loginAgent(app, { email: 'taken-target@example.com', role: 'student' });
          const { email: targetEmail } = await loginAgent(app, { role: 'student' });
          const target = await mustFindUserByEmail(targetEmail);

          const response = await agent
            .patch(`/api/users/${target._id.toString()}`)
            .send({ email: 'taken-target@example.com' });

          expect(response.status).toBe(409);
        });
      });

      describe('Когда меняется email на свободный', () => {
        it('должен сбросить isEmailVerified в false (регрессия — смена почты требует повторного подтверждения)', async () => {
          // Given
          const { agent } = await loginAgent(app, { role: 'admin' });
          const { email: targetEmail } = await loginAgent(app, { role: 'student' });
          const target = await mustFindUserByEmail(targetEmail);
          expect(target.isEmailVerified).toBe(true);

          // When
          const response = await agent
            .patch(`/api/users/${target._id.toString()}`)
            .send({ email: 'brand-new-email@example.com' });

          // Then
          expect(response.status).toBe(200);
          expect(response.body.user.isEmailVerified).toBe(false);

          const stored = await UserModel.findById(target._id);
          expect(stored?.email).toBe('brand-new-email@example.com');
          expect(stored?.isEmailVerified).toBe(false);
        });
      });
    });
  });

  describe('DELETE /api/users/:id', () => {
    describe('Когда запрос без авторизации', () => {
      it('должен вернуть 401', async () => {
        const response = await request(app).delete('/api/users/507f1f77bcf86cd799439011');
        expect(response.status).toBe(401);
      });
    });

    describe('Когда пользователь с ролью student', () => {
      it('должен вернуть 403', async () => {
        const { agent, email } = await loginAgent(app, { role: 'student' });
        const self = await mustFindUserByEmail(email);

        const response = await agent.delete(`/api/users/${self._id.toString()}`);

        expect(response.status).toBe(403);
      });
    });

    describe('Когда пользователь с ролью admin', () => {
      it('должен вернуть 404 для несуществующего id', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });

        const response = await agent.delete('/api/users/507f1f77bcf86cd799439011');

        expect(response.status).toBe(404);
      });

      it('должен удалить пользователя и вернуть 204', async () => {
        const { agent } = await loginAgent(app, { role: 'admin' });
        const { email: targetEmail } = await loginAgent(app, { role: 'student' });
        const target = await mustFindUserByEmail(targetEmail);

        const response = await agent.delete(`/api/users/${target._id.toString()}`);

        expect(response.status).toBe(204);
        const stored = await UserModel.findById(target._id);
        expect(stored).toBeNull();
      });
    });
  });
});
