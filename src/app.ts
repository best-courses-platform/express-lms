import express from 'express';
import { engine } from 'express-handlebars';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import passport from 'passport';
import path from 'path';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/user.routes';
import coursesRouter from './modules/courses/course.routes';
import lessonsRouter from './modules/lessons/lesson.routes';
import viewsRouter from './modules/views/view.routes';
import { initializePassport } from './passport/config';
import { errorHandler } from './middleware/error-handler';
import { apiRateLimiter } from './middleware/rate-limit';
import { config } from './config';

const __dirname = path.resolve();

const app = express();

// Используем Record для индексной сигнатуры
type HelperFunction = (...args: unknown[]) => unknown;
type HandlebarsHelpers = Record<string, HelperFunction>;

const handlebarsHelpers: HandlebarsHelpers = {
  eq: <T>(a: T, b: T): boolean => a === b,
  json: (context: unknown): string => JSON.stringify(context),
  formatDate: (date: unknown): string => {
    if (date instanceof Date && !isNaN(date.getTime())) {
      return date.toLocaleDateString('ru-RU');
    }

    if (typeof date === 'string') {
      const parsedDate = new Date(date);

      if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toLocaleDateString('ru-RU');
      }
    }
    return 'Invalid Date';
  },
};

app.engine(
  'hbs',
  engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'src', 'views', 'layouts'),
    partialsDir: path.join(__dirname, 'src', 'views', 'partials'),
    // false — дефолт express-handlebars, оставлен явным. С true шаблон получает доступ
    // к прототипным методам/свойствам любого переданного объекта (Object.prototype,
    // методы Mongoose-документов и т.д.) — расширяет поверхность для атак вроде
    // prototype pollution через данные, попавшие в шаблон. Ни один текущий .hbs
    // не использует ничего, кроме собственных полей моделей.
    runtimeOptions: {
      allowProtoPropertiesByDefault: false,
      allowProtoMethodsByDefault: false,
    },
    helpers: handlebarsHelpers,
  })
);

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Статические файлы
app.use(express.static(path.join(__dirname, 'src', 'public')));

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

// View routes
app.use('/', viewsRouter);

// Должен быть подключён последним — Express находит error-middleware по количеству
// параметров (err, req, res, next), а не по порядку объявления, но применяется только
// к ошибкам, случившимся в мидлварах/роутах, зарегистрированных до него.
app.use(errorHandler);

export default app;
