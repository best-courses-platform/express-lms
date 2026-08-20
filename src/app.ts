import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import passport from 'passport';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/user.routes';
import coursesRouter from './modules/courses/course.routes';
import lessonsRouter from './modules/lessons/lesson.routes';
import { initializePassport } from './passport/config';
import { errorHandler } from './middleware/error-handler';
import { apiRateLimiter } from './middleware/rate-limit';
import { COMMON_MESSAGES } from './shared/constants/messages';
import { config } from './config';
import { buildOpenApiDocument } from './openapi/document';

const app = express();

app.use(helmet());

// credentials: true — обязателен вместе с явным origin (не '*'), т.к. авторизация идёт через
// httpOnly cookie (access_token/refresh_token); браузер не отправит cookie на cross-origin
// запрос без Access-Control-Allow-Credentials в ответе. origin — из FRONTEND_URL, не открыт всем.
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(passport.initialize());

initializePassport();

// Общий лимит запросов на весь /api/* — первая линия защиты от DoS/скрапинга.
// Более строгий authRateLimiter навешан точечно на auth-роуты, см. auth.routes.ts.
app.use('/api', apiRateLimiter);

// API routes
// Аутентификация — единый механизм: jwtAuth (passport-jwt), навешан точечно на защищённые
// роуты внутри каждого роутера. Никакого глобального гейта здесь больше нет — иначе
// "публичные" GET-роуты (список курсов, уроков) требовали бы логин, как было раньше.
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/courses', coursesRouter);
app.use('/api/lessons', lessonsRouter);

// Сгенерировано из тех же Zod-схем, что реально валидируют запросы (см. src/openapi/) —
// не отдельный, вручную поддерживаемый документ, который может разойтись с кодом.
// /api-docs.json — сырой документ, готовый к импорту на editor.swagger.io (курс явно
// требует именно такой файл, см. Obsidian: "0.1 Требования от курса"). Вне префикса /api —
// apiRateLimiter (строка выше) на неё не распространяется, это не действие пользователя,
// а просмотр документации.
const openApiDocument = buildOpenApiDocument();
app.get('/api-docs.json', (_req, res) => res.json(openApiDocument));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

// Чисто API-бэкенд — фронтенд отдельно (lms-web, Next.js). Любой не сматчившийся
// путь — JSON 404, не дефолтная HTML-страница Express (тот же контракт ошибок,
// что и errorHandler ниже: клиент везде получает { error: string }).
app.use((_req, res) => {
  res.status(404).json({ error: COMMON_MESSAGES.ERROR.RESOURCE_NOT_FOUND });
});

// Должен быть подключён последним — Express находит error-middleware по количеству
// параметров (err, req, res, next), а не по порядку объявления, но применяется только
// к ошибкам, случившимся в мидлварах/роутах, зарегистрированных до него.
app.use(errorHandler);

export default app;
