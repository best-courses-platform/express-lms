import { Request, Response, NextFunction } from "express";
import { courseService } from "./course.service";

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