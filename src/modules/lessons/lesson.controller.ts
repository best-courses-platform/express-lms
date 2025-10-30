import { RequestHandler } from "express";
import { lessonService } from "./lesson.service";

export const createLesson: RequestHandler = async (req, res, next) => {
    try {
        const lesson = await lessonService.create(req.body);
        res.status(201).json(lesson);
    } catch (e) { next(e); }
};

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
        const updated = await lessonService.update(req.params.id, req.body);
        res.json(updated);
    } catch (e) { next(e); }
};

export const deleteLesson: RequestHandler = async (req, res, next) => {
    try {
        await lessonService.delete(req.params.id);
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

export const addUserToAllowed: RequestHandler = async (req, res, next) => {
    try {
        const lesson = await lessonService.addUserToAllowed(req.params.lessonId, req.body.userId);
        res.json(lesson);
    } catch (e) { next(e); }
};
