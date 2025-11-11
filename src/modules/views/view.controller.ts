import { Request, Response, NextFunction } from 'express';
import { courseService } from '../courses/course.service';

export async function renderHome(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        res.render('pages/home', {
            title: 'Best Courses Ever - Главная',
            user: req.user
        });
    } catch (e) { next(e); }
}

export async function renderLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        res.render('pages/login', {
            title: 'Вход в систему - Best Courses Ever'
        });
    } catch (e) { next(e); }
}

export async function renderRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        res.render('pages/register', {
            title: 'Регистрация - Best Courses Ever'
        });
    } catch (e) { next(e); }
}

export async function renderCourseCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.user) {
            res.redirect('/login');
            return;
        }

        res.render('pages/course-create', {
            title: 'Создать курс - Best Courses Ever',
            user: req.user
        });
    } catch (e) { next(e); }
}

export async function renderCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const courses = await courseService.getPublishedCourses();

        res.render('pages/courses', {
            title: 'Все курсы - Best Courses Ever',
            user: req.user,
            courses: courses
        });
    } catch (e) { next(e); }
}

export async function renderCourseDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const courseId = req.params.id;
        const course = await courseService.getById(courseId);

        if (!course) {
            res.status(404).render('pages/notFound', {
                title: 'Курс не найден - Best Courses Ever'
            });
            return;
        }

        // Проверяем доступ
        const isAuthor = req.user &&
            course.author &&
            req.user._id.toString() === course.author.toString();

        if (!course.isPublished && !isAuthor) {
            res.status(403).render('pages/error', {
                title: 'Доступ запрещен - Best Courses Ever',
                error: 'Этот курс еще не опубликован'
            });
            return;
        }

        res.render('pages/course-detail', {
            title: `${course.title} - Best Courses Ever`,
            user: req.user,
            course: course
        });
    } catch (e) { next(e); }
}

export async function renderProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.user) {
            res.redirect('/login');
            return;
        }

        res.render('pages/profile', {
            title: 'Мой профиль - Best Courses Ever',
            user: req.user
        });
    } catch (e) { next(e); }
}

export async function renderNotFound(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        res.status(404).render('pages/notFound', {
            title: 'Страница не найдена - Best Courses Ever'
        });
    } catch (e) { next(e); }
}