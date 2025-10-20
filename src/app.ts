import express from 'express';
import { engine } from 'express-handlebars';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
// import {usersRouter} from './models/users/users.router';
// import {coursesRouter} from './models/courses/courses.router';
// import {authRouter} from './models/auth/auth.router';

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


// app.use("/users", usersRouter);
// app.use('/courses', coursesRouter)
// app.use('/auth', authRouter)

app.get('/', ()=>{
    console.log("Home")
})

export default app;