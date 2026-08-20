import { z } from 'zod';
import { registry, authSecurity, errorResponse, jsonBody } from './registry';
import {
  accessCheckSchema,
  courseIdParamSchema,
  createLessonForCourseSchema,
  deleteFileSchema,
  deleteResourceSchema,
  idParamSchema,
  lessonResourceSchema,
  updateLessonSchema,
  uploadFileSchema,
  videoFileSchema,
} from '../modules/lessons/lesson.schema';

const TAG = 'Lessons';

const objectId = () => z.string().openapi({ example: '507f1f77bcf86cd799439011' });

const lessonResponseSchema = registry.register(
  'Lesson',
  z.object({
    _id: objectId(),
    title: z.string(),
    description: z.string(),
    courseId: objectId(),
    order: z.number().int(),
    videoFile: videoFileSchema.optional(),
    resources: z.array(lessonResourceSchema).optional(),
    tags: z.array(z.string()),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
);

function lessonEnvelope(description: string) {
  return { description, content: { 'application/json': { schema: z.object({ success: z.boolean(), message: z.string(), data: lessonResponseSchema }) } } };
}

registry.registerPath({
  method: 'get',
  path: '/api/lessons',
  tags: [TAG],
  summary: 'Список всех уроков (без фильтра по курсу/публикации)',
  responses: { 200: { description: 'Массив уроков', content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.array(lessonResponseSchema) }) } } } },
});

registry.registerPath({
  method: 'get',
  path: '/api/lessons/{id}',
  tags: [TAG],
  summary: 'Урок по id',
  description: 'Доступ проверяется транзитивно через курс, которому принадлежит урок (courseService.canAccess) — авторизация опциональна, но учитывается, если передана.',
  security: [...authSecurity, {}],
  request: { params: idParamSchema.shape.params },
  responses: {
    200: lessonEnvelope('Урок'),
    403: errorResponse('Курс урока недоступен текущему пользователю'),
    404: errorResponse('Урок не найден'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/lessons/course/{courseId}',
  tags: [TAG],
  summary: 'Уроки курса',
  security: [...authSecurity, {}],
  request: { params: courseIdParamSchema.shape.params },
  responses: {
    200: { description: 'Массив уроков курса', content: { 'application/json': { schema: z.object({ success: z.boolean(), data: z.array(lessonResponseSchema) }) } } },
    403: errorResponse('Курс недоступен текущему пользователю'),
    404: errorResponse('Курс не найден'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/lessons/{lessonId}/access/{userId}',
  tags: [TAG],
  summary: 'Проверка доступа конкретного пользователя к уроку',
  request: { params: accessCheckSchema.shape.params },
  responses: {
    200: { description: 'Результат проверки', content: { 'application/json': { schema: z.object({ success: z.boolean(), message: z.string(), data: z.object({ hasAccess: z.boolean() }) }) } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/lessons/course/{courseId}',
  tags: [TAG],
  summary: 'Создание урока в курсе',
  description: 'Единственный путь создания урока — требует быть автором курса. order генерируется автоматически (следующий по счёту), в теле не передаётся.',
  security: authSecurity,
  request: { params: createLessonForCourseSchema.shape.params, body: jsonBody(createLessonForCourseSchema.shape.body) },
  responses: {
    201: lessonEnvelope('Урок создан'),
    400: errorResponse('Ошибка валидации'),
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Курс не найден'),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/lessons/{id}',
  tags: [TAG],
  summary: 'Обновление урока',
  description: 'Только автор курса, которому принадлежит урок. Присылать нужно только реально изменяемые поля (Zod-схема без .default(), см. Рефакторинг проблем/15).',
  security: authSecurity,
  request: { params: updateLessonSchema.shape.params, body: jsonBody(updateLessonSchema.shape.body) },
  responses: {
    200: lessonEnvelope('Урок обновлён'),
    400: errorResponse('Ошибка валидации'),
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Урок не найден'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/lessons/{id}',
  tags: [TAG],
  summary: 'Полное удаление урока',
  description: 'Проверяет владение, чистит файлы урока из S3, удаляет документ, убирает ссылку из курса — в отличие от DELETE /api/courses/{id}/lessons/{lessonId}, который только отвязывает.',
  security: authSecurity,
  request: { params: idParamSchema.shape.params },
  responses: {
    204: { description: 'Урок удалён' },
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Урок не найден'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/lessons/{lessonId}/files/video',
  tags: [TAG],
  summary: 'Загрузка/замена видео урока',
  description: 'PUT-семантика — новая загрузка сама заменяет старое видео и чистит его из S3. Только автор курса.',
  security: authSecurity,
  request: {
    params: uploadFileSchema.shape.params,
    body: { content: { 'multipart/form-data': { schema: z.object({ file: z.string().openapi({ format: 'binary' }), fileType: z.literal('video') }) } } },
  },
  responses: {
    200: { description: 'Видео загружено', content: { 'application/json': { schema: z.object({ success: z.boolean(), message: z.string(), data: lessonResponseSchema, fileUrl: z.string() }) } } },
    400: errorResponse('Файл не передан или неверный тип'),
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Урок не найден'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/lessons/{lessonId}/files/resource',
  tags: [TAG],
  summary: 'Загрузка материала урока (файл-ресурс)',
  description: 'Добавляется в список ресурсов, либо заменяет ресурс с тем же title, если он уже есть. Только автор курса.',
  security: authSecurity,
  request: {
    params: uploadFileSchema.shape.params,
    body: { content: { 'multipart/form-data': { schema: z.object({ file: z.string().openapi({ format: 'binary' }), fileType: z.literal('resource'), title: z.string().optional(), description: z.string().optional() }) } } },
  },
  responses: {
    200: { description: 'Материал загружен', content: { 'application/json': { schema: z.object({ success: z.boolean(), message: z.string(), data: lessonResponseSchema, fileUrl: z.string() }) } } },
    400: errorResponse('Файл не передан или неверный тип'),
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Урок не найден'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/lessons/{lessonId}/files',
  tags: [TAG],
  summary: 'Удаление файла урока (видео или ресурс) по URL',
  description: 'Для видео — использует $unset, не { videoFile: undefined } (см. Рефакторинг проблем/14, регрессия на молчаливую потерю поля).',
  security: authSecurity,
  request: { params: deleteFileSchema.shape.params, body: jsonBody(deleteFileSchema.shape.body) },
  responses: {
    200: lessonEnvelope('Файл удалён'),
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Урок не найден'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/lessons/{lessonId}/resources/{resourceIndex}',
  tags: [TAG],
  summary: 'Удаление ресурса урока по индексу в массиве resources',
  security: authSecurity,
  request: { params: deleteResourceSchema.shape.params },
  responses: {
    200: lessonEnvelope('Ресурс удалён'),
    400: errorResponse('Индекс не является числом'),
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Урок не найден'),
  },
});
