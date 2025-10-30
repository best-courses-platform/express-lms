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
import {validateConfig} from "./config/config";
import { initializePassport } from './passport/config';

const __dirname = path.resolve();

const app = express();

app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'src', 'views', 'layouts'),
    partialsDir: path.join(__dirname, 'src', 'views', 'partials'),
    runtimeOptions: {
        allowProtoPropertiesByDefault: true,
        allowProtoMethodsByDefault: true
    },
    helpers: {
        eq: (a: any, b: any) => a === b,
        json: (context: any) => JSON.stringify(context),
        formatDate: (date: Date) => date.toLocaleDateString('ru-RU')
    }
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Статические файлы
app.use(express.static(path.join(__dirname, 'src', 'public')));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Добавьте после express.json()
app.use(cookieParser());

app.use(passport.initialize());

// Уберите express-session (не нужно для JWT)
// app.use(session({ ... }));

validateConfig();
initializePassport();


// API routes
app.use("/api/auth", authRoutes);  // → POST /api/auth/login
app.use("/api/users", usersRoutes);
app.use('/api/courses', coursesRouter);
app.use('/api/lessons', lessonsRouter);

// View routes (рендеринг страниц)
app.use('/', viewsRouter);         // → GET /login

export default app;