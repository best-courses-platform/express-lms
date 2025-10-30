import { RequestHandler } from "express";
import { lessonService } from "./lesson.service";
import { courseService } from "courses/course.service";
import { AppError } from "../../utils/errors";
import { isAuthenticatedRequest, getUserIdFromRequest } from "../../utils/typeGuards";

export const createLessonForCourse: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Требуется авторизация");
        }

        const userId = getUserIdFromRequest(req);
        const courseId = req.params.courseId;

        // Проверяем, что пользователь - автор курса
        const course = await courseService.getById(courseId);
        if (!course.author.equals(userId)) {
            throw new AppError(403, "Только автор курса может добавлять уроки");
        }

        // Автоматически определяем порядковый номер
        const order = await lessonService.getNextOrderNumber(courseId);

        const lessonData = {
            ...req.body,
            courseId,
            order
        };

        const lesson = await lessonService.create(lessonData);

        // Автоматически добавляем урок в курс
        await courseService.addLesson(courseId, lesson._id.toString(), userId);

        res.status(201).json(lesson);
    } catch (e) { next(e); }
};

export const createLesson: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Требуется авторизация");
        }

        const lesson = await lessonService.create(req.body);
        res.status(201).json(lesson);
    } catch (e) { next(e); }
};

// Остальные методы остаются без изменений...
export const listLessons: RequestHandler = async (_req, res, next) => {
    try {
        const lessons = await lessonService.list();
        res.json(lessons);
    } catch (e) { next(e); }
};

export const getLesson: RequestHandler = async (req, res, next) => {
    try {
        const lesson = await lessonService.getById(req.params.id);
        res.json(lesson);
    } catch (e) { next(e); }
};

export const updateLesson: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Требуется авторизация");
        }

        const userId = getUserIdFromRequest(req);
        const updated = await lessonService.update(req.params.id, req.body, userId);
        res.json(updated);
    } catch (e) { next(e); }
};

export const deleteLesson: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Требуется авторизация");
        }

        const userId = getUserIdFromRequest(req);
        await lessonService.delete(req.params.id, userId);
        res.status(204).send();
    } catch (e) { next(e); }
};

export const getLessonsByCourse: RequestHandler = async (req, res, next) => {
    try {
        const lessons = await lessonService.getByCourseId(req.params.courseId);
        res.json(lessons);
    } catch (e) { next(e); }
};

export const checkLessonAccess: RequestHandler = async (req, res, next) => {
    try {
        const hasAccess = await lessonService.checkUserAccess(req.params.lessonId, req.params.userId);
        res.json({ hasAccess });
    } catch (e) { next(e); }
};