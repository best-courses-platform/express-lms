import { Request, Response, NextFunction } from "express";
import { courseService } from "./course.service";
import {AppError} from "../../utils/errors";
import {IUser} from "../users/user.types"
import { isAuthenticatedRequest, getUserIdFromRequest } from "../../utils/typeGuards";

export interface AuthenticatedRequest extends Request {
    user: IUser;
}
export async function createCourse(req: Request, res: Response, next: NextFunction) {
    try {
        const course = await courseService.create(req.body);
        res.status(201).json(course);
    } catch (e) { next(e); }
}

export async function listCourse(_req: Request, res: Response, next: NextFunction) {
    try {
        const course = await courseService.list();
        res.json(course);
    } catch (e) { next(e); }
}

export async function getPublishedCourses(_req: Request, res: Response, next: NextFunction) {
    try {
        const courses = await courseService.getPublishedCourses();
        res.json(courses);
    } catch (e) { next(e); }
}

export async function getCoursesByAuthor(req: Request, res: Response, next: NextFunction) {
    try {
        const courses = await courseService.getCoursesByAuthor(req.params.authorId);
        res.json(courses);
    } catch (e) { next(e); }
}

export async function getCoursesByDifficulty(req: Request, res: Response, next: NextFunction) {
    try {
        const courses = await courseService.getCoursesByDifficulty(req.params.level);
        res.json(courses);
    } catch (e) { next(e); }
}

export async function getCourse(req: Request, res: Response, next: NextFunction) {
    try {
        const course = await courseService.getById(req.params.id);
        res.json(course);
    } catch (e) { next(e); }
}

export async function updateCourse(req: Request, res: Response, next: NextFunction) {
    try {
        const updated = await courseService.update(req.params.id, req.body);
        res.json(updated);
    } catch (e) { next(e); }
}

export async function deleteCourse(req: Request, res: Response, next: NextFunction) {
    try {
        await courseService.delete(req.params.id);
        res.status(204).send();
    } catch (e) { next(e); }
}

export async function addLesson(req: Request, res: Response, next: NextFunction) {
    try {
        const updated = await courseService.addLesson(req.params.id, req.params.lessonId);
        res.json(updated);
    } catch (e) { next(e); }
}

export async function removeLesson(req: Request, res: Response, next: NextFunction) {
    try {
        const updated = await courseService.removeLesson(req.params.id, req.params.lessonId);
        res.json(updated);
    } catch (e) { next(e); }
}

export async function addRating(req: Request, res: Response, next: NextFunction) {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Authentication required");
        }
        const userId = getUserIdFromRequest(req);
        const updated = await courseService.addRating(req.params.id, userId, req.body.value);
        res.json(updated);
    } catch (e) { next(e); }
}

export async function getRatings(req: Request, res: Response, next: NextFunction) {
    try {
        const ratings = await courseService.getRatings(req.params.id);
        res.json(ratings);
    } catch (e) { next(e); }
}

export async function removeRating(req: Request, res: Response, next: NextFunction) {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Authentication required");
        }
        const userId = getUserIdFromRequest(req);
        const updated = await courseService.removeRating(req.params.id, userId);
        res.json(updated);
    } catch (e) { next(e); }
}