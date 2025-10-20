import express from 'express';
import { engine } from 'express-handlebars';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import usersRoutes from './modules/users/user.routes';
import coursesRouter from './modules/courses/course.routes';
import lessonsRouter from './modules/lessons/lesson.routes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    runtimeOptions: {
        allowProtoPropertiesByDefault: true,
        allowProtoMethodsByDefault: true
    },
    helpers: {
        // Добавляем хелпер eq для сравнения
        eq: (a: any, b: any) => a === b,
        // Добавляем другие хелперы если нужно
        json: (context: any) => JSON.stringify(context),
        formatDate: (date: Date) => date.toLocaleDateString('ru-RU')
    }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use("/users", usersRoutes);
app.use('/courses', coursesRouter)
app.use('/lessons', lessonsRouter)

app.get('/', ()=>{
    console.log("Home")
})

export default app;