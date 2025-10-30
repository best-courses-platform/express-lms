import { RequestHandler } from "express";
import { userService } from "./user.service";

export const createUser: RequestHandler = async (req, res, next) => {
    try {
        const user = await userService.create(req.body);
        res.status(201).json(user);
    } catch (e) { next(e); }
};

export const listUsers: RequestHandler = async (_req, res, next) => {
    try {
        const users = await userService.list();
        res.json(users);
    } catch (e) { next(e); }
};

export const getUser: RequestHandler = async (req, res, next) => {
    try {
        const user = await userService.getById(req.params.id);
        res.json(user);
    } catch (e) { next(e); }
};

export const updateUser: RequestHandler = async (req, res, next) => {
    try {
        const updated = await userService.update(req.params.id, req.body);
        res.json(updated);
    } catch (e) { next(e); }
};

export const deleteUser: RequestHandler = async (req, res, next) => {
    try {
        await userService.delete(req.params.id);
        res.status(204).send();
    } catch (e) { next(e); }
};
