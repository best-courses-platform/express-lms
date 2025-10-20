import { Request, Response, NextFunction } from "express";
import { lessonService } from "./lesson.service";

// Создать новый урок
export async function createLesson(req: Request, res: Response, next: NextFunction) {
    try {
        const lesson = await lessonService.create(req.body);
        res.status(201).json(lesson);
    } catch (e) { next(e); }
}

// Получить список всех уроков
export async function listLessons(_req: Request, res: Response, next: NextFunction) {
    try {
        const lessons = await lessonService.list();
        res.json(lessons);
    } catch (e) { next(e); }
}

// Получить урок по ID
export async function getLesson(req: Request, res: Response, next: NextFunction) {
    try {
        const lesson = await lessonService.getById(req.params.id);
        res.json(lesson);
    } catch (e) { next(e); }
}

// Обновить урок
export async function updateLesson(req: Request, res: Response, next: NextFunction) {
    try {
        const updated = await lessonService.update(req.params.id, req.body);
        res.json(updated);
    } catch (e) { next(e); }
}

// Удалить урок
export async function deleteLesson(req: Request, res: Response, next: NextFunction) {
    try {
        await lessonService.delete(req.params.id);
        res.status(204).send();
    } catch (e) { next(e); }
}

// Получить уроки по курсу
export async function getLessonsByCourse(req: Request, res: Response, next: NextFunction) {
    try {
        const lessons = await lessonService.getByCourseId(req.params.courseId);
        res.json(lessons);
    } catch (e) { next(e); }
}

// Проверить доступ пользователя к уроку
export async function checkLessonAccess(req: Request, res: Response, next: NextFunction) {
    try {
        const hasAccess = await lessonService.checkUserAccess(req.params.lessonId, req.params.userId);
        res.json({ hasAccess });
    } catch (e) { next(e); }
}

// Добавить пользователя в список разрешенных
export async function addUserToAllowed(req: Request, res: Response, next: NextFunction) {
    try {
        const lesson = await lessonService.addUserToAllowed(req.params.lessonId, req.body.userId);
        res.json(lesson);
    } catch (e) { next(e); }
}