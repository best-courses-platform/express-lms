import { z } from 'zod';
import { registry, authSecurity, errorResponse, jsonBody } from './registry';
import {
  addRatingSchema,
  authorParamSchema,
  createCourseSchema,
  difficultyParamSchema,
  idParamSchema,
  lessonManagementSchema,
  searchCourseSchema,
  updateCourseSchema,
} from '../modules/courses/course.schema';
import { enrollSchema, unenrollSchema, listStudentsSchema } from '../modules/enrollments/enrollment.schema';

const TAG = 'Courses';

const objectId = () => z.string().openapi({ example: '507f1f77bcf86cd799439011' });

// author — либо чистый ObjectId-строка (ответ create — сервер сам подставляет из токена,
// не популейтит заново), либо популейченный объект (все find*-эндпоинты) — см.
// getCourseAuthorId в lms-web/src/lib/api/types.ts, где эта же двойственность документирована
// со стороны фронтенда.
const courseAuthorSchema = z.union([
  objectId(),
  z.object({ _id: objectId(), name: z.string(), email: z.string().email(), avatar: z.string().nullable() }),
]);

// Именованный компонент (registry.register), а не голая инлайн-схема — иначе
// openapi-typescript на lms-web не мог бы сослаться на него как на components["schemas"]["Rating"],
// только через громоздкий path-level тип; кодоген типов (см. Обзор — что чинили и почему/1)
// строится на именованных компонентах.
const ratingSchema = registry.register(
  'Rating',
  z.object({
    userId: objectId(),
    value: z.number().min(1).max(5),
    createdAt: z.coerce.date(),
  })
);

const courseResponseSchema = registry.register(
  'Course',
  z.object({
    _id: objectId(),
    title: z.string(),
    description: z.string(),
    previewImage: z.string().url(),
    author: courseAuthorSchema,
    tags: z.array(z.string()),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    lessons: z.array(objectId()).optional(),
    lessonsCount: z.number(),
    averageRating: z.number().optional(),
    isPublished: z.boolean(),
    studentsCount: z.number(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
);

// Тот же мотив именованного компонента, что и у Rating выше — используется и в ответе
// enroll (одна запись), и в списке listStudents (массив).
const enrollmentResponseSchema = registry.register(
  'Enrollment',
  z.object({
    _id: objectId(),
    courseId: objectId(),
    userId: z.union([objectId(), z.object({ _id: objectId(), name: z.string(), email: z.string().email() })]),
    status: z.enum(['active', 'revoked']),
    enrolledAt: z.coerce.date(),
  })
);

function courseMessageResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: z.object({ message: z.string(), course: courseResponseSchema }) } },
  };
}

registry.registerPath({
  method: 'get',
  path: '/api/courses',
  tags: [TAG],
  summary: 'Список всех курсов (без фильтра по публикации)',
  responses: {
    200: { description: 'Массив курсов', content: { 'application/json': { schema: z.array(courseResponseSchema) } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/courses/published',
  tags: [TAG],
  summary: 'Публичный каталог — только опубликованные курсы',
  responses: {
    200: {
      description: 'Массив опубликованных курсов',
      content: { 'application/json': { schema: z.array(courseResponseSchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/courses/author/{authorId}',
  tags: [TAG],
  summary: 'Курсы конкретного автора',
  request: { params: authorParamSchema.shape.params },
  responses: {
    200: {
      description: 'Массив курсов автора',
      content: { 'application/json': { schema: z.array(courseResponseSchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/courses/difficulty/{level}',
  tags: [TAG],
  summary: 'Курсы по уровню сложности',
  request: { params: difficultyParamSchema.shape.params },
  responses: {
    200: {
      description: 'Массив курсов заданной сложности',
      content: { 'application/json': { schema: z.array(courseResponseSchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/courses/search',
  tags: [TAG],
  summary: 'Полнотекстовый поиск по опубликованным курсам (title/description)',
  description: 'Нативный $text-поиск MongoDB, отсортирован по релевантности (textScore).',
  request: { query: searchCourseSchema.shape.query },
  responses: {
    200: {
      description: 'Массив курсов, отсортированный по релевантности',
      content: { 'application/json': { schema: z.array(courseResponseSchema) } },
    },
    400: errorResponse('Поисковый запрос не передан'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/courses/mine',
  tags: [TAG],
  summary: 'Мои курсы — авторские (author/admin) или доступные (student, через запись на курс)',
  security: authSecurity,
  responses: {
    200: { description: 'Массив курсов', content: { 'application/json': { schema: z.array(courseResponseSchema) } } },
    401: errorResponse('Не авторизован'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/courses/{id}',
  tags: [TAG],
  summary: 'Курс по id',
  description:
    'Непубликованный курс виден только автору/записанным студентам (canAccess) — авторизация опциональна, но учитывается, если токен передан.',
  security: [...authSecurity, {}],
  request: { params: idParamSchema.shape.params },
  responses: {
    200: { description: 'Курс', content: { 'application/json': { schema: courseResponseSchema } } },
    403: errorResponse('Курс не опубликован, и текущий пользователь не имеет к нему доступа'),
    404: errorResponse('Курс не найден'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/courses/preview-image',
  tags: [TAG],
  summary: 'Загрузка обложки курса (до создания самого курса)',
  description:
    'Возвращает публичный URL — его нужно передать как previewImage при POST /api/courses. Требует роль author/admin.',
  security: authSecurity,
  request: {
    body: {
      content: { 'multipart/form-data': { schema: z.object({ file: z.string().openapi({ format: 'binary' }) }) } },
    },
  },
  responses: {
    200: {
      description: 'Файл загружен',
      content: { 'application/json': { schema: z.object({ message: z.string(), url: z.string().url() }) } },
    },
    400: errorResponse('Файл не передан'),
    401: errorResponse('Не авторизован'),
    403: errorResponse('Требуется роль author/admin'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/courses',
  tags: [TAG],
  summary: 'Создание курса',
  description:
    'author в теле игнорируется — сервер всегда берёт его из токена (защита от mass assignment, см. Рефакторинг проблем/1). Требует роль author/admin.',
  security: authSecurity,
  request: { body: jsonBody(createCourseSchema.shape.body) },
  responses: {
    201: courseMessageResponse('Курс создан'),
    400: errorResponse('Ошибка валидации'),
    401: errorResponse('Не авторизован'),
    403: errorResponse('Требуется роль author/admin'),
    409: errorResponse('Курс с таким названием уже существует'),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/courses/{id}',
  tags: [TAG],
  summary: 'Обновление курса',
  description:
    'Только автор курса. Присылать нужно только реально изменяемые поля — остальные останутся как есть (Zod-схема построена без .default(), см. Рефакторинг проблем/15).',
  security: authSecurity,
  request: { params: updateCourseSchema.shape.params, body: jsonBody(updateCourseSchema.shape.body) },
  responses: {
    200: courseMessageResponse('Курс обновлён'),
    400: errorResponse('Ошибка валидации'),
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Курс не найден'),
    409: errorResponse('Новое название уже занято другим курсом'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/courses/{id}',
  tags: [TAG],
  summary: 'Удаление курса',
  description: 'Каскадно удаляет все уроки курса и их файлы в S3 (см. Рефакторинг проблем/16). Только автор курса.',
  security: authSecurity,
  request: { params: idParamSchema.shape.params },
  responses: {
    200: { description: 'Курс удалён', content: { 'application/json': { schema: z.object({ message: z.string() }) } } },
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Курс не найден'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/courses/{id}/lessons/{lessonId}',
  tags: [TAG],
  summary: 'Привязать существующий урок к курсу',
  security: authSecurity,
  request: { params: lessonManagementSchema.shape.params },
  responses: {
    200: courseMessageResponse('Урок привязан'),
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Курс не найден'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/courses/{id}/lessons/{lessonId}',
  tags: [TAG],
  summary: 'Отвязать урок от курса (сам документ урока не удаляется)',
  description:
    'Только отвязывает — документ урока остаётся в коллекции lessons, файлы в S3 не трогаются. Для полного удаления — DELETE /api/lessons/{id}.',
  security: authSecurity,
  request: { params: lessonManagementSchema.shape.params },
  responses: {
    200: courseMessageResponse('Урок отвязан'),
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Курс не найден'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/courses/{id}/enrollments',
  tags: [TAG],
  summary: 'Записать студента на курс по email',
  description:
    'Только автор курса. Принимает email, не userId — автор обычно знает почту студента, не его внутренний id. Идемпотентно: повторный вызов для уже записанного студента ничего не ломает и не задваивает studentsCount.',
  security: authSecurity,
  request: { params: enrollSchema.shape.params, body: jsonBody(enrollSchema.shape.body) },
  responses: {
    201: {
      description: 'Студент записан',
      content: { 'application/json': { schema: z.object({ message: z.string(), enrollment: enrollmentResponseSchema }) } },
    },
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Курс не найден или пользователь с таким email не найден'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/courses/{id}/enrollments',
  tags: [TAG],
  summary: 'Список активных студентов курса',
  security: authSecurity,
  request: { params: listStudentsSchema.shape.params },
  responses: {
    200: {
      description: 'Массив активных записей',
      content: { 'application/json': { schema: z.array(enrollmentResponseSchema) } },
    },
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Курс не найден'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/courses/{id}/enrollments/{userId}',
  tags: [TAG],
  summary: 'Отчислить студента с курса',
  description: 'Soft-delete через status: "revoked" — история записи сохраняется, документ не удаляется.',
  security: authSecurity,
  request: { params: unenrollSchema.shape.params },
  responses: {
    200: { description: 'Студент отчислен', content: { 'application/json': { schema: z.object({ message: z.string() }) } } },
    401: errorResponse('Не авторизован'),
    403: errorResponse('Вызывающий не автор курса'),
    404: errorResponse('Курс не найден или студент не был записан'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/courses/{id}/ratings',
  tags: [TAG],
  summary: 'Оценить курс (1-5)',
  description: 'Повторная оценка тем же пользователем пересчитывает averageRating (см. Рефакторинг проблем/13).',
  security: authSecurity,
  request: { params: addRatingSchema.shape.params, body: jsonBody(addRatingSchema.shape.body) },
  responses: {
    200: courseMessageResponse('Оценка сохранена'),
    400: errorResponse('Значение вне диапазона 1-5'),
    401: errorResponse('Не авторизован'),
    404: errorResponse('Курс не найден'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/courses/{id}/ratings',
  tags: [TAG],
  summary: 'Список оценок курса',
  request: { params: idParamSchema.shape.params },
  responses: {
    200: { description: 'Массив оценок', content: { 'application/json': { schema: z.array(ratingSchema) } } },
    404: errorResponse('Курс не найден'),
  },
});
