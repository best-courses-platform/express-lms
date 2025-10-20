import { Request, Response, NextFunction } from "express";
import { userService } from "./user.service";

export async function createUser(req: Request, res: Response, next: NextFunction) {
    try {
        const user = await userService.create(req.body);
        res.status(201).json(user);
    } catch (e) { next(e); }
}

export async function listUsers(_req: Request, res: Response, next: NextFunction) {
    try {
        const users = await userService.list();
        res.json(users);
    } catch (e) { next(e); }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
    try {
        const user = await userService.getById(req.params.id);
        res.json(user);
    } catch (e) { next(e); }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
    try {
        const updated = await userService.update(req.params.id, req.body);
        res.json(updated);
    } catch (e) { next(e); }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
        await userService.delete(req.params.id);
        res.status(204).send();
    } catch (e) { next(e); }
}