import { Types } from 'mongoose';
import { Request } from 'express';

// Проверка на ObjectId
export function isObjectId(id: unknown): id is Types.ObjectId {
    return id instanceof Types.ObjectId;
}

// Проверка на строку, которую можно преобразовать в ObjectId
export function isValidObjectIdString(id: unknown): id is string {
    return typeof id === 'string' && Types.ObjectId.isValid(id);
}

// Преобразование в строку ObjectId
export function toObjectIdString(id: unknown): string {
    if (isObjectId(id)) {
        return id.toString();
    }
    if (isValidObjectIdString(id)) {
        return id;
    }
    throw new Error('Invalid ObjectId');
}

// Проверка на массив ObjectId
export function isObjectIdArray(ids: unknown[]): ids is Types.ObjectId[] {
    return Array.isArray(ids) && ids.every(id => isObjectId(id));
}

// Преобразование массива в строки ObjectId
export function toObjectIdStringArray(ids: unknown[]): string[] {
    if (!Array.isArray(ids)) {
        throw new Error('Input is not an array');
    }
    return ids.map(id => toObjectIdString(id));
}

// Новые тип-гарды для Express Request и аутентификации
export interface AuthenticatedUser {
    _id: Types.ObjectId;
    email: string;
    name: string;
    role: string;
}

// Упрощенный интерфейс для аутентифицированного запроса
declare module 'express' {
    interface Request {
        user?: AuthenticatedUser;
    }
}

// Тип-гард для проверки аутентифицированного запроса
export function isAuthenticatedRequest(req: Request): req is Request & { user: AuthenticatedUser } {
    return !!(req.user && req.user._id);
}

// Безопасное получение пользователя из запроса
export function getUserFromRequest(req: Request): AuthenticatedUser {
    if (!isAuthenticatedRequest(req)) {
        throw new Error('User not found in request');
    }
    return req.user;
}

// Безопасное получение userId из запроса
export function getUserIdFromRequest(req: Request): Types.ObjectId {
    const user = getUserFromRequest(req);
    return user._id;
}