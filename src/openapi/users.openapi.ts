import { z } from 'zod';
import { registry, authSecurity, errorResponse, jsonBody } from './registry';
import { createUserSchema, idParamSchema, updateUserSchema } from '../modules/users/user.schema';

const TAG = 'Users';

// Модуль целиком — только role: admin (requireRole(['admin']) на каждом роуте, см.
// user.routes.ts). В отличие от courses/lessons здесь нет отдельного author-пути.
const ADMIN_ONLY = 'Требуется роль admin.';

// Ответ — toJSON() модели User убирает password/emailVerificationToken/
// emailVerificationExpires/passwordResetToken/passwordResetExpires (см. user.model.ts) —
// эта схема отражает то, что реально долетает до клиента, не саму Mongoose-схему.
const userResponseSchema = registry.register(
  'User',
  z.object({
    _id: z.string().openapi({ example: '507f1f77bcf86cd799439011' }),
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['student', 'author', 'admin']),
    avatar: z.string().nullable().optional(),
    googleId: z.string().optional(),
    githubId: z.string().optional(),
    isEmailVerified: z.boolean(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
);

registry.registerPath({
  method: 'post',
  path: '/api/users',
  tags: [TAG],
  summary: 'Создание пользователя администратором',
  description: ADMIN_ONLY,
  security: authSecurity,
  request: { body: jsonBody(createUserSchema.shape.body) },
  responses: {
    201: { description: 'Пользователь создан', content: { 'application/json': { schema: z.object({ message: z.string(), user: userResponseSchema }) } } },
    400: errorResponse('Ошибка валидации (например, пароли не совпадают)'),
    401: errorResponse('Не авторизован'),
    403: errorResponse(ADMIN_ONLY),
    409: errorResponse('Email уже занят'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/users',
  tags: [TAG],
  summary: 'Список всех пользователей',
  description: ADMIN_ONLY,
  security: authSecurity,
  responses: {
    200: { description: 'Массив пользователей', content: { 'application/json': { schema: z.array(userResponseSchema) } } },
    401: errorResponse('Не авторизован'),
    403: errorResponse(ADMIN_ONLY),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/users/{id}',
  tags: [TAG],
  summary: 'Пользователь по id',
  description: ADMIN_ONLY,
  security: authSecurity,
  request: { params: idParamSchema.shape.params },
  responses: {
    200: { description: 'Пользователь', content: { 'application/json': { schema: userResponseSchema } } },
    401: errorResponse('Не авторизован'),
    403: errorResponse(ADMIN_ONLY),
    404: errorResponse('Пользователь не найден'),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/users/{id}',
  tags: [TAG],
  summary: 'Обновление пользователя администратором',
  description:
    ADMIN_ONLY +
    ' Присылать нужно только реально изменяемые поля — role, не указанный в теле, останется прежним ' +
    '(Zod-схема без .default(), см. Рефакторинг проблем/15 — этот же баг ранее приводил к тихому сбросу роли на student).',
  security: authSecurity,
  request: { params: updateUserSchema.shape.params, body: jsonBody(updateUserSchema.shape.body) },
  responses: {
    200: { description: 'Пользователь обновлён', content: { 'application/json': { schema: z.object({ message: z.string(), user: userResponseSchema }) } } },
    400: errorResponse('Ошибка валидации (например, ни одно поле не передано)'),
    401: errorResponse('Не авторизован'),
    403: errorResponse(ADMIN_ONLY),
    404: errorResponse('Пользователь не найден'),
    409: errorResponse('Новый email уже занят другим пользователем'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/users/{id}',
  tags: [TAG],
  summary: 'Удаление пользователя',
  description: ADMIN_ONLY,
  security: authSecurity,
  request: { params: idParamSchema.shape.params },
  responses: {
    204: { description: 'Пользователь удалён' },
    401: errorResponse('Не авторизован'),
    403: errorResponse(ADMIN_ONLY),
    404: errorResponse('Пользователь не найден'),
  },
});
