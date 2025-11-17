// domains/users/user.controller.ts
import { RequestHandler } from "express";
import { userService } from "./user.service";
import { validate } from "../../middleware/validate";
import {
    createUserSchema,
    updateUserSchema,
    idParamSchema,
} from "./user.schema";
import { USER_MESSAGES } from "./user.constants";

export const createUser: RequestHandler = async (req, res, next) => {
    try {
        const user = await userService.create(req.body);
        res.status(201).json({
            message: USER_MESSAGES.SUCCESS.USER_CREATED,
            user
        });
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
        res.json({
            message: USER_MESSAGES.SUCCESS.USER_UPDATED,
            user: updated
        });
    } catch (e) { next(e); }
};

export const deleteUser: RequestHandler = async (req, res, next) => {
    try {
        await userService.delete(req.params.id);
        res.status(204).send();
    } catch (e) { next(e); }
};

// Экспорт с валидацией для использования в routes
export const UserController = {
    createUser: [validate(createUserSchema), createUser],
    listUsers,
    getUser: [validate(idParamSchema, "params"), getUser],
    updateUser: [validate(updateUserSchema), updateUser],
    deleteUser: [validate(idParamSchema, "params"), deleteUser],
};