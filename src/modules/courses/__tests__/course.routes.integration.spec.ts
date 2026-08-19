import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { Types } from 'mongoose';
import { CourseModel } from '../course.model';
import { LessonModel } from 'lessons/lesson.model';
import { UserModel } from 'users/user.model';
import app from '../../../app';
import { loginAgent, mustFindUserByEmail } from '../../../../test/helpers';

// Полный сквозной прогон: реальный Express (все middleware — helmet/cors/rate-limit
// passthrough в test-окружении/passport) + реальный Mongoose поверх mongodb-memory-server.
// SELECTEL_* креды явно обнулены в test/setupTestEnv.ts — загрузка/удаление файлов урока
// (см. тест каскадного удаления ниже) работает в mock-режиме fileStorageService, не бьёт
// по реальному S3-бакету.

async function createCourseViaApi(
  agent: ReturnType<typeof request.agent>,
  overrides: Partial<{
    title: string;
    description: string;
    previewImage: string;
    tags: string[];
    difficulty: string;
    isPublished: boolean;
  }> = {}
) {
  const response = await agent.post('/api/courses').send({
    title: overrides.title ?? `Course ${Date.now()}-${Math.random().toString(36).slice(2)}`,
    description: overrides.description ?? 'A sufficiently long description for validation purposes.',
    previewImage: overrides.previewImage ?? 'https://example.com/preview.png',
    tags: overrides.tags ?? [],
    difficulty: overrides.difficulty ?? 'beginner',
    isPublished: overrides.isPublished ?? false,
  });
  return response.body.course;
}

describe('Course routes (integration)', () => {
  describe('POST /api/courses', () => {
    describe('Когда запрос без авторизации', () => {
      it('должен вернуть 401', async () => {
        const response = await request(app).post('/api/courses').send({ title: 'X' });
        expect(response.status).toBe(401);
      });
    });

    describe('Когда пользователь с ролью student', () => {
      it('должен вернуть 403 — создавать курсы могут только author/admin', async () => {
        const { agent } = await loginAgent(app, { role: 'student' });

        const response = await agent.post('/api/courses').send({
          title: 'Student Course',
          description: 'A sufficiently long description here.',
          previewImage: 'https://example.com/preview.png',
        });

        expect(response.status).toBe(403);
      });
    });

    describe('Когда пользователь с ролью author', () => {
      it('должен создать курс с author из токена, даже если в теле подсунут чужой id', async () => {
        // Регрессия на mass assignment (см. Рефакторинг проблем/1) — тот же класс защиты,
        // что уже проверен для role при регистрации, здесь — для author при создании курса.
        const { agent, email } = await loginAgent(app, { role: 'author' });
        const impostorAuthorId = new Types.ObjectId().toString();

        const response = await agent.post('/api/courses').send({
          title: `Author Course ${Date.now()}`,
          description: 'A sufficiently long description here.',
          previewImage: 'https://example.com/preview.png',
          author: impostorAuthorId,
        });

        expect(response.status).toBe(201);
        expect(response.body.course.author).not.toBe(impostorAuthorId);

        const stored = await CourseModel.findById(response.body.course._id);
        expect(stored?.author.toString()).not.toBe(impostorAuthorId);

        const realAuthor = await UserModel.findOne({ email });
        expect(stored?.author.toString()).toBe(realAuthor?._id.toString());
      });
    });

    describe('Когда курс с таким названием уже существует', () => {
      it('должен вернуть 409', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const title = `Dup Course ${Date.now()}`;
        await createCourseViaApi(agent, { title });

        const response = await agent.post('/api/courses').send({
          title,
          description: 'A sufficiently long description here.',
          previewImage: 'https://example.com/preview.png',
        });

        expect(response.status).toBe(409);
      });
    });
  });

  describe('GET /api/courses/published', () => {
    it('должен вернуть только опубликованные курсы, не черновики', async () => {
      const { agent } = await loginAgent(app, { role: 'author' });
      const published = await createCourseViaApi(agent, { isPublished: true });
      const draft = await createCourseViaApi(agent, { isPublished: false });

      const response = await request(app).get('/api/courses/published');

      const ids = (response.body as Array<{ _id: string }>).map(c => c._id);
      expect(ids).toContain(published._id);
      expect(ids).not.toContain(draft._id);
    });
  });

  describe('GET /api/courses/:id', () => {
    describe('Когда курс опубликован', () => {
      it('должен быть виден анонимному пользователю', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, { isPublished: true });

        const response = await request(app).get(`/api/courses/${course._id}`);

        expect(response.status).toBe(200);
      });
    });

    describe('Когда курс не опубликован', () => {
      it('должен вернуть 403 анонимному пользователю', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, { isPublished: false });

        const response = await request(app).get(`/api/courses/${course._id}`);

        expect(response.status).toBe(403);
      });

      it('должен быть виден автору курса', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, { isPublished: false });

        const response = await agent.get(`/api/courses/${course._id}`);

        expect(response.status).toBe(200);
      });

      it('должен вернуть 403 постороннему верифицированному пользователю', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent, { isPublished: false });

        const { agent: strangerAgent } = await loginAgent(app, { role: 'student' });
        const response = await strangerAgent.get(`/api/courses/${course._id}`);

        expect(response.status).toBe(403);
      });

      it('должен быть виден пользователю из allowedUsers', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent, { isPublished: false });

        const { agent: studentAgent, email: studentEmail } = await loginAgent(app, { role: 'student' });
        const student = await mustFindUserByEmail(studentEmail);

        await authorAgent.post(`/api/courses/${course._id}/allowed-users`).send({ userId: student._id.toString() });

        const response = await studentAgent.get(`/api/courses/${course._id}`);
        expect(response.status).toBe(200);
      });
    });

    describe('Когда курс не существует', () => {
      it('должен вернуть 404', async () => {
        const response = await request(app).get(`/api/courses/${new Types.ObjectId().toString()}`);
        expect(response.status).toBe(404);
      });
    });
  });

  describe('PATCH /api/courses/:id', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен вернуть 403', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent);

        const { agent: strangerAgent } = await loginAgent(app, { role: 'author' });
        const response = await strangerAgent.patch(`/api/courses/${course._id}`).send({ title: 'Hacked' });

        expect(response.status).toBe(403);
      });
    });

    describe('Когда автор меняет только одно поле', () => {
      it('не должен сбрасывать остальные поля (регрессия на баг №15 — Zod .partial()+.default())', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, {
          tags: ['node.js', 'backend'],
          isPublished: true,
          difficulty: 'advanced',
        });

        const response = await agent.patch(`/api/courses/${course._id}`).send({ title: 'Renamed Course' });

        expect(response.status).toBe(200);
        expect(response.body.course.title).toBe('Renamed Course');
        expect(response.body.course.tags).toEqual(['node.js', 'backend']);
        expect(response.body.course.isPublished).toBe(true);
        expect(response.body.course.difficulty).toBe('advanced');
      });
    });
  });

  describe('DELETE /api/courses/:id', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен вернуть 403 и не удалять курс', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent);

        const { agent: strangerAgent } = await loginAgent(app, { role: 'author' });
        const response = await strangerAgent.delete(`/api/courses/${course._id}`);

        expect(response.status).toBe(403);
        expect(await CourseModel.findById(course._id)).not.toBeNull();
      });
    });

    describe('Когда автор удаляет курс с уроком', () => {
      it('должен удалить и курс, и все его уроки (регрессия на баг №16 — "сироты" в БД)', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);

        const lessonResponse = await agent.post(`/api/lessons/course/${course._id}`).send({
          title: 'Lesson to be cascaded',
          description: 'A sufficiently long lesson description.',
          tags: [],
        });
        const lessonId = lessonResponse.body.data._id;

        const response = await agent.delete(`/api/courses/${course._id}`);

        expect(response.status).toBe(200);
        expect(await CourseModel.findById(course._id)).toBeNull();
        expect(await LessonModel.findById(lessonId)).toBeNull();
      });
    });
  });

  describe('POST /api/courses/:id/allowed-users и DELETE .../allowed-users/:userId', () => {
    it('должен предоставлять и отзывать доступ к непубликованному курсу', async () => {
      const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
      const course = await createCourseViaApi(authorAgent, { isPublished: false });

      const { agent: studentAgent, email: studentEmail } = await loginAgent(app, { role: 'student' });
      const student = await mustFindUserByEmail(studentEmail);

      await authorAgent.post(`/api/courses/${course._id}/allowed-users`).send({ userId: student._id.toString() });
      const afterAdd = await studentAgent.get(`/api/courses/${course._id}`);
      expect(afterAdd.status).toBe(200);

      await authorAgent.delete(`/api/courses/${course._id}/allowed-users/${student._id.toString()}`);
      const afterRemove = await studentAgent.get(`/api/courses/${course._id}`);
      expect(afterRemove.status).toBe(403);
    });
  });

  describe('POST /api/courses/:id/ratings', () => {
    describe('Когда запрос без авторизации', () => {
      it('должен вернуть 401', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, { isPublished: true });

        const response = await request(app).post(`/api/courses/${course._id}/ratings`).send({ value: 5 });
        expect(response.status).toBe(401);
      });
    });

    describe('Когда один пользователь оценивает курс дважды разными значениями', () => {
      it('должна остаться только последняя оценка, averageRating должен пересчитаться', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent, { isPublished: true });

        const { agent: raterAgent } = await loginAgent(app, { role: 'student' });

        await raterAgent.post(`/api/courses/${course._id}/ratings`).send({ value: 2 });
        const secondResponse = await raterAgent.post(`/api/courses/${course._id}/ratings`).send({ value: 5 });

        expect(secondResponse.status).toBe(200);
        expect(secondResponse.body.course.ratings).toHaveLength(1);
        expect(secondResponse.body.course.ratings[0].value).toBe(5);
        expect(secondResponse.body.course.averageRating).toBe(5);

        const ratingsResponse = await request(app).get(`/api/courses/${course._id}/ratings`);
        expect(ratingsResponse.body).toHaveLength(1);
      });
    });
  });

  describe('GET /api/courses/author/:authorId', () => {
    it('должен вернуть курсы конкретного автора, не курсы других авторов', async () => {
      const { agent: authorAgent, email } = await loginAgent(app, { role: 'author' });
      const author = await mustFindUserByEmail(email);
      const ownCourse = await createCourseViaApi(authorAgent);

      const { agent: otherAgent } = await loginAgent(app, { role: 'author' });
      await createCourseViaApi(otherAgent);

      const response = await request(app).get(`/api/courses/author/${author._id.toString()}`);

      const ids = (response.body as Array<{ _id: string }>).map(c => c._id);
      expect(ids).toEqual([ownCourse._id]);
    });
  });

  describe('GET /api/courses/difficulty/:level', () => {
    it('должен вернуть только курсы указанного уровня сложности', async () => {
      const { agent } = await loginAgent(app, { role: 'author' });
      const advanced = await createCourseViaApi(agent, { difficulty: 'advanced' });
      const beginner = await createCourseViaApi(agent, { difficulty: 'beginner' });

      const response = await request(app).get('/api/courses/difficulty/advanced');

      const ids = (response.body as Array<{ _id: string }>).map(c => c._id);
      expect(ids).toContain(advanced._id);
      expect(ids).not.toContain(beginner._id);
    });
  });

  describe('GET /api/courses/mine', () => {
    describe('Когда запрос без авторизации', () => {
      it('должен вернуть 401', async () => {
        const response = await request(app).get('/api/courses/mine');
        expect(response.status).toBe(401);
      });
    });

    describe('Когда пользователь — автор', () => {
      it('должен вернуть курсы, которые он ведёт', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);

        const response = await agent.get('/api/courses/mine');

        expect(response.status).toBe(200);
        const ids = (response.body as Array<{ _id: string }>).map(c => c._id);
        expect(ids).toContain(course._id);
      });
    });

    describe('Когда пользователь — student без доступа ни к одному курсу', () => {
      it('должен вернуть пустой список', async () => {
        const { agent } = await loginAgent(app, { role: 'student' });

        const response = await agent.get('/api/courses/mine');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
      });
    });

    describe('Когда пользователь — student, добавленный в allowedUsers чужого курса', () => {
      it('должен вернуть этот курс', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent, { isPublished: false });

        const { agent: studentAgent, email: studentEmail } = await loginAgent(app, { role: 'student' });
        const student = await mustFindUserByEmail(studentEmail);
        await authorAgent.post(`/api/courses/${course._id}/allowed-users`).send({ userId: student._id.toString() });

        const response = await studentAgent.get('/api/courses/mine');

        expect(response.status).toBe(200);
        const ids = (response.body as Array<{ _id: string }>).map(c => c._id);
        expect(ids).toEqual([course._id]);
      });
    });
  });

  describe('POST /api/courses/:id/lessons/:lessonId и DELETE .../lessons/:lessonId', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен вернуть 403 при попытке добавить чужой урок в чужой курс', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent);

        const { agent: strangerAgent } = await loginAgent(app, { role: 'author' });
        const response = await strangerAgent.post(
          `/api/courses/${course._id}/lessons/${new Types.ObjectId().toString()}`
        );

        expect(response.status).toBe(403);
      });
    });

    describe('Когда автор добавляет и затем убирает урок', () => {
      it('должен обновить course.lessons соответственно', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);

        const lessonResponse = await agent.post(`/api/lessons/course/${course._id}`).send({
          title: 'Standalone lesson',
          description: 'A sufficiently long lesson description.',
          tags: [],
        });
        const lessonId = lessonResponse.body.data._id;

        // createLessonForCourse уже сам добавляет урок в курс (см. lesson.service.ts) —
        // проверяем именно ручное управление через course-роут: сначала убираем,
        // потом возвращаем обратно тем же эндпоинтом, что тестируем.
        const removeResponse = await agent.delete(`/api/courses/${course._id}/lessons/${lessonId}`);
        expect(removeResponse.status).toBe(200);
        expect(removeResponse.body.course.lessons).not.toContain(lessonId);

        const addResponse = await agent.post(`/api/courses/${course._id}/lessons/${lessonId}`);
        expect(addResponse.status).toBe(200);
        expect(addResponse.body.course.lessons.map((l: { _id: string } | string) => (typeof l === 'string' ? l : l._id))).toContain(
          lessonId
        );
      });
    });
  });

  describe('POST /api/courses/preview-image', () => {
    describe('Когда запрос без авторизации', () => {
      it('должен вернуть 401', async () => {
        const response = await request(app)
          .post('/api/courses/preview-image')
          .attach('file', Buffer.from('not-really-an-image'), 'preview.png');

        expect(response.status).toBe(401);
      });
    });

    describe('Когда пользователь с ролью student', () => {
      it('должен вернуть 403 — загружать обложку могут только author/admin', async () => {
        const { agent } = await loginAgent(app, { role: 'student' });

        const response = await agent
          .post('/api/courses/preview-image')
          .attach('file', Buffer.from('not-really-an-image'), 'preview.png');

        expect(response.status).toBe(403);
      });
    });

    describe('Когда автор загружает файл, который не является изображением', () => {
      it('должен вернуть 400', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });

        const response = await agent
          .post('/api/courses/preview-image')
          .attach('file', Buffer.from('plain text content'), { filename: 'notes.txt', contentType: 'text/plain' });

        expect(response.status).toBe(400);
      });
    });

    describe('Когда автор загружает валидное изображение', () => {
      it('должен вернуть URL загруженного файла', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        // Минимальный валидный PNG (1×1 пиксель) — reused отовсюду для smoke-тестов загрузки.
        const onePixelPng = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64'
        );

        const response = await agent
          .post('/api/courses/preview-image')
          .attach('file', onePixelPng, { filename: 'preview.png', contentType: 'image/png' });

        expect(response.status).toBe(200);
        expect(typeof response.body.url).toBe('string');
      });
    });
  });
});
