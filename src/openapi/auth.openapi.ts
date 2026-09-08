import { z } from 'zod';
import { registry, authSecurity, errorResponse, jsonBody } from './registry';
import {
  changePasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  requestPasswordResetSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sessionIdParamSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '../modules/auth/auth.schema';

const TAG = 'Auth';

// Read-модели ответов — не формальная валидация (её на выходе в этом API нет вообще,
// Zod здесь применяется только на вход, см. middleware/validate.ts), а честный слепок
// того, что реально собирают auth.controller.ts/*.ts в JSON-ответ.
const userSummarySchema = registry.register(
  'UserSummary',
  z.object({
    id: z.string().openapi({ example: '507f1f77bcf86cd799439011' }),
    email: z.string().email(),
    name: z.string(),
    role: z.enum(['student', 'author', 'admin']),
  })
);

const userDetailSchema = registry.register(
  'UserDetail',
  userSummarySchema.extend({
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
);

// Публичная проекция refresh-сессии (см. refresh-session.types.ts SessionView) — без
// tokenHash/familyId/replacedBySession, тех клиенту знать незачем.
const sessionViewSchema = registry.register(
  'SessionView',
  z.object({
    id: z.string().openapi({ example: '507f1f77bcf86cd799439011' }),
    current: z.boolean().openapi({ description: 'true у сессии, соответствующей refresh_token текущего запроса' }),
    createdAt: z.coerce.date(),
    lastUsedAt: z.coerce.date().nullable(),
    expiresAt: z.coerce.date(),
    userAgent: z.string().nullable(),
    ip: z.string().nullable(),
  })
);

registry.registerPath({
  method: 'post',
  path: '/api/auth/register',
  tags: [TAG],
  summary: 'Регистрация нового пользователя',
  description:
    'Роль всегда student, даже если в теле прислано другое — сервер не доверяет полю role из запроса. ' +
    'Сессия/токены НЕ выдаются (см. Рефакторинг проблем/9) — вход возможен только после подтверждения email.',
  request: { body: jsonBody(registerSchema.shape.body) },
  responses: {
    201: {
      description: 'Пользователь создан',
      content: { 'application/json': { schema: z.object({ message: z.string(), user: userSummarySchema }) } },
    },
    400: errorResponse('Ошибка валидации (например, пароли не совпадают)'),
    409: errorResponse('Email уже зарегистрирован'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  tags: [TAG],
  summary: 'Вход по email/паролю',
  description:
    'Требует подтверждённый email. При успехе выдаёт httpOnly cookie access_token/refresh_token и токен в теле ответа.',
  request: { body: jsonBody(loginSchema.shape.body) },
  responses: {
    200: {
      description: 'Успешный вход',
      content: {
        'application/json': { schema: z.object({ message: z.string(), token: z.string(), user: userSummarySchema }) },
      },
    },
    401: errorResponse('Неверный email или пароль'),
    403: errorResponse('Email не подтверждён'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/login/local',
  tags: [TAG],
  summary: 'Вход через passport local-стратегию',
  description:
    'Функционально то же самое, что POST /login (email+password в теле), только через passport ' +
    'вместо прямого вызова authService.login() — исторически второй путь, ведущий к тому же результату ' +
    '(включая проверку подтверждённого email, см. Рефакторинг проблем/17).',
  request: { body: jsonBody(z.object({ email: z.string().email(), password: z.string() })) },
  responses: {
    200: {
      description: 'Успешный вход',
      content: {
        'application/json': { schema: z.object({ message: z.string(), token: z.string(), user: userSummarySchema }) },
      },
    },
    401: errorResponse('Неверный email или пароль'),
    403: errorResponse('Email не подтверждён'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/auth/google',
  tags: [TAG],
  summary: 'Начало OAuth-входа через Google',
  description:
    'Редирект браузера на страницу авторизации Google — не JSON-эндпоинт, вызывается прямым переходом по ссылке, не через fetch.',
  responses: { 302: { description: 'Редирект на accounts.google.com' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/auth/google/callback',
  tags: [TAG],
  summary: 'Callback после авторизации в Google',
  description:
    'Вызывается самим Google, не клиентом напрямую. При успехе ставит cookie токенов и редиректит на FRONTEND_URL, при ошибке — на FRONTEND_URL/login?error=auth_failed.',
  responses: { 302: { description: 'Редирект на фронтенд (успех или ошибка)' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/auth/github',
  tags: [TAG],
  summary: 'Начало OAuth-входа через GitHub',
  responses: { 302: { description: 'Редирект на github.com/login/oauth' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/auth/github/callback',
  tags: [TAG],
  summary: 'Callback после авторизации в GitHub',
  responses: { 302: { description: 'Редирект на фронтенд (успех или ошибка)' } },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/refresh',
  tags: [TAG],
  summary: 'Обновление пары access/refresh токенов',
  description:
    'Refresh-токен — из тела запроса ИЛИ из cookie refresh_token (тело в приоритете, если оба присутствуют). ' +
    'Refresh — opaque-строка "sessionId.secret" в БД, one-time-use с ротацией: каждый обмен выдаёт новый ' +
    'refresh и помечает старый использованным (см. Рефакторинг проблем/31). Повторное предъявление уже ' +
    'провёрнутого токена вне короткого grace-window трактуется как компрометация — гасится вся "семья" ' +
    'сессии разом, включая только что выданного легитимного потомка.',
  request: { body: jsonBody(refreshTokenSchema.shape.body!.unwrap()) },
  responses: {
    200: {
      description: 'Новая пара токенов',
      content: {
        'application/json': { schema: z.object({ message: z.string(), token: z.string(), user: userSummarySchema }) },
      },
    },
    401: errorResponse(
      'Refresh-токен отсутствует, невалиден, просрочен, либо сессия отозвана (logout/смена пароля/reuse detection)'
    ),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/logout',
  tags: [TAG],
  summary: 'Выход — отзыв refresh-сессии на сервере и очистка cookie',
  description:
    'Отзывает refresh-сессию, соответствующую cookie refresh_token, на сервере (не только чистит cookie ' +
    'клиента) — см. Рефакторинг проблем/31. Не завершает уже выпущенный access-токен (он проверяется без ' +
    'обращения к БД и живёт до истечения своего TTL) — только последующий обмен по этому refresh-токену.',
  security: authSecurity,
  responses: {
    200: {
      description: 'Успешный выход',
      content: { 'application/json': { schema: z.object({ message: z.string() }) } },
    },
    401: errorResponse('Не авторизован'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/logout-all',
  tags: [TAG],
  summary: 'Выход со всех устройств — отзыв всех refresh-сессий пользователя',
  description: 'В отличие от POST /logout, отзывает вообще все активные сессии, включая ту, с которой вызван.',
  security: authSecurity,
  responses: {
    200: {
      description: 'Все сессии отозваны',
      content: { 'application/json': { schema: z.object({ message: z.string() }) } },
    },
    401: errorResponse('Не авторизован'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/auth/sessions',
  tags: [TAG],
  summary: 'Список активных refresh-сессий текущего пользователя',
  description:
    '"Активные сессии / устройства" — базовый пункт настроек безопасности. current: true у сессии, ' +
    'соответствующей refresh_token текущего запроса (если cookie не передана — ни одна не помечена текущей).',
  security: authSecurity,
  responses: {
    200: {
      description: 'Список сессий',
      content: { 'application/json': { schema: z.object({ sessions: z.array(sessionViewSchema) }) } },
    },
    401: errorResponse('Не авторизован'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/auth/sessions/{id}',
  tags: [TAG],
  summary: 'Отозвать конкретную сессию ("выйти с этого устройства")',
  description: 'Чужая или несуществующая сессия — 404 (не 403), чтобы не подтверждать существование чужого id.',
  security: authSecurity,
  request: { params: sessionIdParamSchema.shape.params },
  responses: {
    204: { description: 'Сессия отозвана' },
    401: errorResponse('Не авторизован'),
    404: errorResponse('Сессия не найдена (либо принадлежит другому пользователю)'),
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/auth/me',
  tags: [TAG],
  summary: 'Текущий пользователь по токену',
  security: authSecurity,
  responses: {
    200: {
      description: 'Данные текущего пользователя',
      content: { 'application/json': { schema: z.object({ user: userDetailSchema }) } },
    },
    401: errorResponse('Не авторизован'),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/auth/profile',
  tags: [TAG],
  summary: 'Обновление имени/email текущего пользователя',
  description:
    'Смена email сбрасывает isEmailVerified и требует повторного подтверждения (тот же контракт, что и PATCH /api/users/:id).',
  security: authSecurity,
  request: { body: jsonBody(updateProfileSchema.shape.body) },
  responses: {
    200: {
      description: 'Профиль обновлён',
      content: { 'application/json': { schema: z.object({ message: z.string(), user: userDetailSchema }) } },
    },
    400: errorResponse('Ошибка валидации (например, ни одно поле не передано)'),
    401: errorResponse('Не авторизован'),
    409: errorResponse('Email уже занят другим пользователем'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/change-password',
  tags: [TAG],
  summary: 'Смена пароля текущего пользователя',
  description:
    'Отзывает остальные активные refresh-сессии пользователя (кроме той, с которой вызван запрос) — ' +
    'паттерн GitHub/Google, см. Рефакторинг проблем/31.',
  security: authSecurity,
  request: { body: jsonBody(changePasswordSchema.shape.body) },
  responses: {
    200: {
      description: 'Пароль изменён',
      content: { 'application/json': { schema: z.object({ message: z.string() }) } },
    },
    400: errorResponse('Текущий пароль указан неверно, либо пароли не совпадают'),
    401: errorResponse('Не авторизован'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/verify-email',
  tags: [TAG],
  summary: 'Подтверждение email по токену из письма',
  request: { body: jsonBody(verifyEmailSchema.shape.body) },
  responses: {
    200: {
      description: 'Email подтверждён',
      content: {
        'application/json': {
          schema: z.object({ message: z.string(), user: userSummarySchema.extend({ isEmailVerified: z.boolean() }) }),
        },
      },
    },
    400: errorResponse('Токен невалиден или просрочен'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/resend-verification',
  tags: [TAG],
  summary: 'Повторная отправка письма подтверждения',
  description:
    'Всегда отвечает 200, даже если email не зарегистрирован или уже подтверждён — иначе ответ бы палил факт существования аккаунта (user enumeration).',
  request: { body: jsonBody(resendVerificationSchema.shape.body) },
  responses: {
    200: {
      description: 'Тихий успех независимо от реального состояния аккаунта',
      content: { 'application/json': { schema: z.object({ message: z.string() }) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/request-password-reset',
  tags: [TAG],
  summary: 'Запрос сброса пароля',
  description:
    'Тот же принцип, что и resend-verification — единообразный тихий ответ, не палящий существование аккаунта.',
  request: { body: jsonBody(requestPasswordResetSchema.shape.body) },
  responses: {
    200: {
      description: 'Тихий успех независимо от реального состояния аккаунта',
      content: { 'application/json': { schema: z.object({ message: z.string() }) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/reset-password',
  tags: [TAG],
  summary: 'Сброс пароля по токену',
  description:
    'Отзывает ВСЕ активные refresh-сессии пользователя, без исключения — на момент сброса запрос не ' +
    'аутентифицирован ни в одной сессии, щадить нечего (в отличие от change-password выше).',
  request: { body: jsonBody(resetPasswordSchema.shape.body) },
  responses: {
    200: {
      description: 'Пароль сброшен',
      content: { 'application/json': { schema: z.object({ message: z.string() }) } },
    },
    400: errorResponse('Токен невалиден/просрочен, либо пароли не совпадают'),
  },
});
