import express from 'express';
import { engine } from 'express-handlebars';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import passport from 'passport';
import path from 'path';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/user.routes';
import coursesRouter from './modules/courses/course.routes';
import lessonsRouter from './modules/lessons/lesson.routes';
import viewsRouter from './modules/views/view.routes';
import { initializePassport } from './passport/config';
import { refreshTokenMiddleware } from './middleware/refresh-token';

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
    runtimeOptions: {
      allowProtoPropertiesByDefault: true,
      allowProtoMethodsByDefault: true,
    },
    helpers: handlebarsHelpers,
  })
);

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Статические файлы
app.use(express.static(path.join(__dirname, 'src', 'public')));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(passport.initialize());

initializePassport();

// API routes
app.use('/api/auth', authRoutes);
app.use(refreshTokenMiddleware);
app.use('/api/users', usersRoutes);
app.use('/api/courses', coursesRouter);
app.use('/api/lessons', lessonsRouter);

// View routes
app.use('/', viewsRouter);

export default app;
