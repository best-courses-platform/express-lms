import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { Types } from 'mongoose';
import { LessonModel } from '../lesson.model';
import { CourseModel } from 'courses/course.model';
import app from '../../../app';
import { loginAgent, mustFindUserByEmail } from '../../../../test/helpers';

// Полный сквозной прогон: реальный Express + реальный Mongoose поверх mongodb-memory-server.
// SELECTEL_* креды явно обнулены в test/setupTestEnv.ts — fileStorageService работает в
// mock-режиме (URL вида mock://...), загрузка файлов ниже не бьёт по реальному S3-бакету.

async function createCourseViaApi(
  agent: ReturnType<typeof request.agent>,
  overrides: Partial<{ isPublished: boolean }> = {}
) {
  const response = await agent.post('/api/courses').send({
    title: `Course ${Date.now()}-${Math.random().toString(36).slice(2)}`,
    description: 'A sufficiently long description for validation purposes.',
    previewImage: 'https://example.com/preview.png',
    tags: [],
    difficulty: 'beginner',
    isPublished: overrides.isPublished ?? false,
  });
  return response.body.course;
}

async function createLessonViaApi(
  agent: ReturnType<typeof request.agent>,
  courseId: string,
  overrides: Partial<{ title: string; description: string; tags: string[] }> = {}
) {
  const response = await agent.post(`/api/lessons/course/${courseId}`).send({
    title: overrides.title ?? `Lesson ${Date.now()}-${Math.random().toString(36).slice(2)}`,
    description: overrides.description ?? 'A sufficiently long lesson description for validation.',
    tags: overrides.tags ?? [],
  });
  return response.body.data;
}

describe('Lesson routes (integration)', () => {
  describe('POST /api/lessons/course/:courseId', () => {
    describe('Когда запрос без авторизации', () => {
      it('должен вернуть 401', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);

        const response = await request(app).post(`/api/lessons/course/${course._id}`).send({
          title: 'X',
          description: 'A sufficiently long lesson description.',
        });

        expect(response.status).toBe(401);
      });
    });

    describe('Когда вызывающий не автор курса', () => {
      it('должен вернуть 403, не создавая урок', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent);

        const { agent: strangerAgent } = await loginAgent(app, { role: 'author' });
        const response = await strangerAgent.post(`/api/lessons/course/${course._id}`).send({
          title: 'Sneaky Lesson',
          description: 'A sufficiently long lesson description.',
        });

        expect(response.status).toBe(403);
      });
    });

    describe('Когда вызывающий — автор курса', () => {
      it('должен создать урок и автоматически привязать его к курсу', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);

        const response = await agent.post(`/api/lessons/course/${course._id}`).send({
          title: 'First Lesson',
          description: 'A sufficiently long lesson description.',
          tags: ['intro'],
        });

        expect(response.status).toBe(201);
        expect(response.body.data.courseId).toBe(course._id);

        const stored = await CourseModel.findById(course._id);
        expect(stored?.lessons?.map(id => id.toString())).toContain(response.body.data._id);
      });

      it('должен автоматически проставлять последовательные порядковые номера', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);

        const first = await createLessonViaApi(agent, course._id, { title: 'Lesson 1' });
        const second = await createLessonViaApi(agent, course._id, { title: 'Lesson 2' });

        expect(first.order).toBe(1);
        expect(second.order).toBe(2);
      });
    });

    describe('Когда название урока уже занято в этом же курсе', () => {
      it('должен вернуть 409', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        await createLessonViaApi(agent, course._id, { title: 'Duplicate' });

        const response = await agent.post(`/api/lessons/course/${course._id}`).send({
          title: 'Duplicate',
          description: 'A sufficiently long lesson description.',
        });

        expect(response.status).toBe(409);
      });
    });
  });

  describe('GET /api/lessons/:id', () => {
    describe('Когда курс урока опубликован', () => {
      it('должен быть виден анонимному пользователю', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, { isPublished: true });
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await request(app).get(`/api/lessons/${lesson._id}`);

        expect(response.status).toBe(200);
      });
    });

    describe('Когда курс урока не опубликован', () => {
      it('должен вернуть 403 анонимному пользователю', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, { isPublished: false });
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await request(app).get(`/api/lessons/${lesson._id}`);

        expect(response.status).toBe(403);
      });

      it('должен быть виден автору курса', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, { isPublished: false });
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await agent.get(`/api/lessons/${lesson._id}`);

        expect(response.status).toBe(200);
      });

      it('должен вернуть 403 постороннему верифицированному пользователю', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent, { isPublished: false });
        const lesson = await createLessonViaApi(authorAgent, course._id);

        const { agent: strangerAgent } = await loginAgent(app, { role: 'student' });
        const response = await strangerAgent.get(`/api/lessons/${lesson._id}`);

        expect(response.status).toBe(403);
      });

      it('должен быть виден пользователю из allowedUsers курса', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent, { isPublished: false });
        const lesson = await createLessonViaApi(authorAgent, course._id);

        const { agent: studentAgent, email: studentEmail } = await loginAgent(app, { role: 'student' });
        const student = await mustFindUserByEmail(studentEmail);
        await authorAgent.post(`/api/courses/${course._id}/allowed-users`).send({ userId: student._id.toString() });

        const response = await studentAgent.get(`/api/lessons/${lesson._id}`);

        expect(response.status).toBe(200);
      });
    });

    describe('Когда урок не существует', () => {
      it('должен вернуть 404', async () => {
        const response = await request(app).get(`/api/lessons/${new Types.ObjectId().toString()}`);
        expect(response.status).toBe(404);
      });
    });
  });

  describe('GET /api/lessons/course/:courseId', () => {
    describe('Когда курс не опубликован и запрос анонимный', () => {
      it('должен вернуть 403', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, { isPublished: false });
        await createLessonViaApi(agent, course._id);

        const response = await request(app).get(`/api/lessons/course/${course._id}`);

        expect(response.status).toBe(403);
      });
    });

    describe('Когда курс опубликован', () => {
      it('должен вернуть уроки курса в порядке order', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, { isPublished: true });
        const first = await createLessonViaApi(agent, course._id, { title: 'A' });
        const second = await createLessonViaApi(agent, course._id, { title: 'B' });

        const response = await request(app).get(`/api/lessons/course/${course._id}`);

        expect(response.status).toBe(200);
        const ids = (response.body.data as Array<{ _id: string }>).map(l => l._id);
        expect(ids).toEqual([first._id, second._id]);
      });
    });
  });

  describe('GET /api/lessons/:lessonId/access/:userId', () => {
    describe('Когда пользователь — автор курса', () => {
      it('должен вернуть hasAccess: true', async () => {
        const { agent, email } = await loginAgent(app, { role: 'author' });
        const author = await mustFindUserByEmail(email);
        const course = await createCourseViaApi(agent, { isPublished: false });
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await request(app).get(`/api/lessons/${lesson._id}/access/${author._id.toString()}`);

        expect(response.body.data.hasAccess).toBe(true);
      });
    });

    describe('Когда курс не опубликован и пользователь посторонний', () => {
      it('должен вернуть hasAccess: false', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, { isPublished: false });
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await request(app).get(
          `/api/lessons/${lesson._id}/access/${new Types.ObjectId().toString()}`
        );

        expect(response.body.data.hasAccess).toBe(false);
      });
    });

    describe('Когда курс опубликован', () => {
      it('должен вернуть hasAccess: true для любого пользователя', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent, { isPublished: true });
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await request(app).get(
          `/api/lessons/${lesson._id}/access/${new Types.ObjectId().toString()}`
        );

        expect(response.body.data.hasAccess).toBe(true);
      });
    });
  });

  describe('PATCH /api/lessons/:id', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен вернуть 403', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent);
        const lesson = await createLessonViaApi(authorAgent, course._id);

        const { agent: strangerAgent } = await loginAgent(app, { role: 'author' });
        const response = await strangerAgent.patch(`/api/lessons/${lesson._id}`).send({ title: 'Hacked' });

        expect(response.status).toBe(403);
      });
    });

    describe('Когда автор меняет только одно поле', () => {
      it('не должен сбрасывать остальные поля (та же защита, что и у курсов — баг №15)', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id, { tags: ['algo', 'basics'] });

        const response = await agent.patch(`/api/lessons/${lesson._id}`).send({ title: 'Renamed Lesson' });

        expect(response.status).toBe(200);
        expect(response.body.data.title).toBe('Renamed Lesson');
        expect(response.body.data.tags).toEqual(['algo', 'basics']);
        expect(response.body.data.order).toBe(lesson.order);
      });
    });

    describe('Когда автор переименовывает урок в название, занятое другим уроком того же курса', () => {
      it('должен вернуть 409', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        await createLessonViaApi(agent, course._id, { title: 'Taken' });
        const lesson = await createLessonViaApi(agent, course._id, { title: 'Free' });

        const response = await agent.patch(`/api/lessons/${lesson._id}`).send({ title: 'Taken' });

        expect(response.status).toBe(409);
      });
    });
  });

  describe('DELETE /api/lessons/:id', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен вернуть 403 и не удалять урок', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent);
        const lesson = await createLessonViaApi(authorAgent, course._id);

        const { agent: strangerAgent } = await loginAgent(app, { role: 'author' });
        const response = await strangerAgent.delete(`/api/lessons/${lesson._id}`);

        expect(response.status).toBe(403);
        expect(await LessonModel.findById(lesson._id)).not.toBeNull();
      });
    });

    describe('Когда автор удаляет урок', () => {
      it('должен удалить урок из БД и отвязать его от course.lessons', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await agent.delete(`/api/lessons/${lesson._id}`);

        expect(response.status).toBe(204);
        expect(await LessonModel.findById(lesson._id)).toBeNull();

        const storedCourse = await CourseModel.findById(course._id);
        expect(storedCourse?.lessons?.map(id => id.toString())).not.toContain(lesson._id);
      });
    });
  });

  describe('POST /api/lessons/:lessonId/files/video', () => {
    describe('Когда запрос без авторизации', () => {
      it('должен вернуть 401', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await request(app)
          .post(`/api/lessons/${lesson._id}/files/video`)
          .field('fileType', 'video')
          .attach('file', Buffer.from('fake video bytes'), { filename: 'lesson.mp4', contentType: 'video/mp4' });

        expect(response.status).toBe(401);
      });
    });

    describe('Когда вызывающий не автор курса', () => {
      it('должен вернуть 403, не загружая видео', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent);
        const lesson = await createLessonViaApi(authorAgent, course._id);

        const { agent: strangerAgent } = await loginAgent(app, { role: 'author' });
        const response = await strangerAgent
          .post(`/api/lessons/${lesson._id}/files/video`)
          .field('fileType', 'video')
          .attach('file', Buffer.from('fake video bytes'), { filename: 'lesson.mp4', contentType: 'video/mp4' });

        expect(response.status).toBe(403);
      });
    });

    describe('Когда файл не является разрешённым типом', () => {
      it('должен вернуть 400', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await agent
          .post(`/api/lessons/${lesson._id}/files/video`)
          .field('fileType', 'video')
          .attach('file', Buffer.from('binary'), { filename: 'app.exe', contentType: 'application/x-msdownload' });

        expect(response.status).toBe(400);
      });
    });

    describe('Когда автор загружает валидное видео', () => {
      it('должен сохранить videoFile урока и вернуть fileUrl', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await agent
          .post(`/api/lessons/${lesson._id}/files/video`)
          .field('fileType', 'video')
          .attach('file', Buffer.from('fake video bytes'), { filename: 'lesson.mp4', contentType: 'video/mp4' });

        expect(response.status).toBe(200);
        expect(typeof response.body.fileUrl).toBe('string');
        expect(response.body.data.videoFile.originalName).toBe('lesson.mp4');
      });

      it('должен удалить старый видеофайл при замене новым (проверяется по логам сервиса, не по S3)', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);

        await agent
          .post(`/api/lessons/${lesson._id}/files/video`)
          .field('fileType', 'video')
          .attach('file', Buffer.from('first video'), { filename: 'first.mp4', contentType: 'video/mp4' });

        const secondResponse = await agent
          .post(`/api/lessons/${lesson._id}/files/video`)
          .field('fileType', 'video')
          .attach('file', Buffer.from('second video'), { filename: 'second.mp4', contentType: 'video/mp4' });

        expect(secondResponse.status).toBe(200);
        expect(secondResponse.body.data.videoFile.originalName).toBe('second.mp4');

        const stored = await LessonModel.findById(lesson._id).lean();
        expect(stored?.videoFile?.originalName).toBe('second.mp4');
      });
    });
  });

  describe('POST /api/lessons/:lessonId/files/resource', () => {
    describe('Когда автор загружает новый ресурс', () => {
      it('должен добавить ресурс в массив resources урока', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await agent
          .post(`/api/lessons/${lesson._id}/files/resource`)
          .field('fileType', 'resource')
          .field('title', 'Cheat Sheet')
          .attach('file', Buffer.from('%PDF-1.4 fake pdf'), { filename: 'sheet.pdf', contentType: 'application/pdf' });

        expect(response.status).toBe(200);
        expect(response.body.data.resources).toHaveLength(1);
        expect(response.body.data.resources[0]).toMatchObject({ type: 'file', title: 'Cheat Sheet' });
      });
    });

    describe('Когда загружается файл с тем же title, что и у существующего file-ресурса', () => {
      it('должен заменить ресурс на месте, не добавляя новый элемент', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);

        await agent
          .post(`/api/lessons/${lesson._id}/files/resource`)
          .field('fileType', 'resource')
          .field('title', 'Notes')
          .attach('file', Buffer.from('version one'), { filename: 'v1.pdf', contentType: 'application/pdf' });

        const response = await agent
          .post(`/api/lessons/${lesson._id}/files/resource`)
          .field('fileType', 'resource')
          .field('title', 'Notes')
          .attach('file', Buffer.from('version two'), { filename: 'v2.pdf', contentType: 'application/pdf' });

        expect(response.status).toBe(200);
        expect(response.body.data.resources).toHaveLength(1);
        expect(response.body.data.resources[0].originalName).toBe('v2.pdf');
      });
    });
  });

  describe('DELETE /api/lessons/:lessonId/files', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен вернуть 403', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent);
        const lesson = await createLessonViaApi(authorAgent, course._id);
        const uploadResponse = await authorAgent
          .post(`/api/lessons/${lesson._id}/files/video`)
          .field('fileType', 'video')
          .attach('file', Buffer.from('video bytes'), { filename: 'v.mp4', contentType: 'video/mp4' });

        const { agent: strangerAgent } = await loginAgent(app, { role: 'author' });
        const response = await strangerAgent
          .delete(`/api/lessons/${lesson._id}/files`)
          .send({ fileUrl: uploadResponse.body.fileUrl, fileType: 'video' });

        expect(response.status).toBe(403);
      });
    });

    describe('Когда удаляется видео', () => {
      it('должен полностью убрать поле videoFile из документа (регрессия — $unset, не $set: undefined)', async () => {
        // См. lesson.repository.ts: { videoFile: undefined } молча теряет ключ при сборке
        // update-объекта в Mongoose — раньше поле оставалось висеть в БД, хотя ответ API
        // выглядел успешным. Проверяем именно отсутствие ключа в документе, не просто
        // videoFile === undefined в JSON-ответе (там оба случая неотличимы).
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);
        const uploadResponse = await agent
          .post(`/api/lessons/${lesson._id}/files/video`)
          .field('fileType', 'video')
          .attach('file', Buffer.from('video bytes'), { filename: 'v.mp4', contentType: 'video/mp4' });

        const response = await agent
          .delete(`/api/lessons/${lesson._id}/files`)
          .send({ fileUrl: uploadResponse.body.fileUrl, fileType: 'video' });

        expect(response.status).toBe(200);
        const stored = await LessonModel.findById(lesson._id).lean();
        expect(stored).not.toBeNull();
        expect(Object.prototype.hasOwnProperty.call(stored, 'videoFile')).toBe(false);
      });
    });

    describe('Когда удаляется ресурс по URL', () => {
      it('должен убрать соответствующий элемент из resources', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);
        const uploadResponse = await agent
          .post(`/api/lessons/${lesson._id}/files/resource`)
          .field('fileType', 'resource')
          .field('title', 'Notes')
          .attach('file', Buffer.from('pdf bytes'), { filename: 'notes.pdf', contentType: 'application/pdf' });

        const response = await agent
          .delete(`/api/lessons/${lesson._id}/files`)
          .send({ fileUrl: uploadResponse.body.fileUrl, fileType: 'resource' });

        expect(response.status).toBe(200);
        expect(response.body.data.resources).toEqual([]);
      });

      it('должен вернуть 404, если ресурс с таким URL не найден', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await agent
          .delete(`/api/lessons/${lesson._id}/files`)
          .send({ fileUrl: 'mock://lessons/missing.pdf', fileType: 'resource' });

        expect(response.status).toBe(404);
      });
    });
  });

  describe('DELETE /api/lessons/:lessonId/resources/:resourceIndex', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен вернуть 403', async () => {
        const { agent: authorAgent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(authorAgent);
        const lesson = await createLessonViaApi(authorAgent, course._id);
        await authorAgent
          .post(`/api/lessons/${lesson._id}/files/resource`)
          .field('fileType', 'resource')
          .field('title', 'Notes')
          .attach('file', Buffer.from('pdf bytes'), { filename: 'notes.pdf', contentType: 'application/pdf' });

        const { agent: strangerAgent } = await loginAgent(app, { role: 'author' });
        const response = await strangerAgent.delete(`/api/lessons/${lesson._id}/resources/0`);

        expect(response.status).toBe(403);
      });
    });

    describe('Когда индекс не является числом', () => {
      it('должен вернуть 400 (валидация схемы)', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await agent.delete(`/api/lessons/${lesson._id}/resources/not-a-number`);

        expect(response.status).toBe(400);
      });
    });

    describe('Когда индекс вне диапазона существующих ресурсов', () => {
      it('должен вернуть 404', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);

        const response = await agent.delete(`/api/lessons/${lesson._id}/resources/0`);

        expect(response.status).toBe(404);
      });
    });

    describe('Когда индекс валиден', () => {
      it('должен удалить ресурс по индексу', async () => {
        const { agent } = await loginAgent(app, { role: 'author' });
        const course = await createCourseViaApi(agent);
        const lesson = await createLessonViaApi(agent, course._id);
        await agent
          .post(`/api/lessons/${lesson._id}/files/resource`)
          .field('fileType', 'resource')
          .field('title', 'Notes')
          .attach('file', Buffer.from('pdf bytes'), { filename: 'notes.pdf', contentType: 'application/pdf' });

        const response = await agent.delete(`/api/lessons/${lesson._id}/resources/0`);

        expect(response.status).toBe(200);
        expect(response.body.data.resources).toEqual([]);
      });
    });
  });
});
