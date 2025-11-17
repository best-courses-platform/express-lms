// typeGuards.ts
import { Types } from 'mongoose';
import { Request } from 'express';
import { User } from "users/user.types";

// Строгие интерфейсы
interface MongooseDocument {
    toObject: <T = unknown>() => T;
    save: () => Promise<unknown>;
    isNew: boolean;
    $isNew: boolean;
    _doc: Record<string, unknown>;
}

interface UserDocument extends User, MongooseDocument {
    comparePassword: (candidatePassword: string) => Promise<boolean>;
}

// Type guards с полной type safety
export function isMongooseDocument(obj: unknown): obj is MongooseDocument {
    if (typeof obj !== 'object' || obj === null) return false;

    const candidate = obj as Record<keyof MongooseDocument, unknown>;

    return (
        typeof candidate.toObject === 'function' &&
        typeof candidate.save === 'function' &&
        typeof candidate.isNew === 'boolean' &&
        typeof candidate.$isNew === 'boolean' &&
        candidate._doc !== null &&
        typeof candidate._doc === 'object'
    );
}

export function hasComparePassword(obj: unknown): obj is { comparePassword: (password: string) => Promise<boolean> } {
    if (typeof obj !== 'object' || obj === null) return false;

    const candidate = obj as { comparePassword?: unknown };

    if (typeof candidate.comparePassword !== 'function') return false;

    // Дополнительная проверка что это именно Promise-returning функция
    try {
        const testResult = (candidate.comparePassword as Function)('test');
        return testResult instanceof Promise;
    } catch {
        return false;
    }
}

export function hasObjectId(obj: unknown): obj is { _id: Types.ObjectId } {
    if (typeof obj !== 'object' || obj === null) return false;

    const candidate = obj as { _id?: unknown };
    return candidate._id instanceof Types.ObjectId;
}

export function hasEmail(obj: unknown): obj is { email: string } {
    if (typeof obj !== 'object' || obj === null) return false;

    const candidate = obj as { email?: unknown };
    return typeof candidate.email === 'string' &&
        candidate.email.includes('@');
}

export function hasPassword(obj: unknown): obj is { password: string } {
    if (typeof obj !== 'object' || obj === null) return false;

    const candidate = obj as { password?: unknown };
    return typeof candidate.password === 'string' &&
        candidate.password.length > 0;
}

// Основной type guard для User документа
export function isUserDocument(obj: unknown): obj is UserDocument {
    return isMongooseDocument(obj) &&
        hasComparePassword(obj) &&
        hasObjectId(obj) &&
        hasEmail(obj) &&
        hasPassword(obj);
}

// Type guard для проверки что это plain User объект
export function isPlainUser(obj: unknown): obj is User {
    if (typeof obj !== 'object' || obj === null) return false;

    const candidate = obj as Partial<User>;

    // Проверяем только необходимые поля User
    const hasRequiredFields = (
        candidate._id instanceof Types.ObjectId &&
        typeof candidate.email === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.role === 'string' &&
        candidate.createdAt instanceof Date &&
        candidate.updatedAt instanceof Date
    );

    if (!hasRequiredFields) return false;

    // Если это Mongoose документ, преобразуем его
    if (isMongooseDocument(candidate)) {
        const plainObject = candidate.toObject();
        return isPlainUser(plainObject); // рекурсивно проверяем plain объект
    }

    return true;
}

// Улучшенная версия для безопасности
export function isUserDocumentStrict(obj: unknown): obj is UserDocument {
    if (!isMongooseDocument(obj) || !hasComparePassword(obj)) {
        return false;
    }

    // Дополнительные проверки свойств User
    const candidate = obj as Partial<User>;
    return (
        candidate._id instanceof Types.ObjectId &&
        typeof candidate.email === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.role === 'string' &&
        candidate.createdAt instanceof Date &&
        candidate.updatedAt instanceof Date
    );
}

// Безопасное преобразование в User
export function toSafeUser(obj: unknown): User {
    if (!isPlainUser(obj)) {
        throw new Error('Invalid user object');
    }
    return obj;
}

export function isUserWithPassword(obj: unknown): obj is User & { password: string } {
    if (!isPlainUser(obj)) return false;

    const candidate = obj as { password?: unknown };
    return typeof candidate.password === 'string';
}

export function isObjectId(id: unknown): id is Types.ObjectId {
    return id instanceof Types.ObjectId;
}

export function isValidObjectIdString(id: unknown): id is string {
    return typeof id === 'string' && Types.ObjectId.isValid(id);
}

export function toObjectIdString(id: unknown): string {
    if (isObjectId(id)) {
        return id.toString();
    }
    if (isValidObjectIdString(id)) {
        return id;
    }
    throw new Error('Invalid ObjectId');
}

export function isObjectIdArray(ids: unknown[]): ids is Types.ObjectId[] {
    return Array.isArray(ids) && ids.every(id => isObjectId(id));
}

export function toObjectIdStringArray(ids: unknown[]): string[] {
    if (!Array.isArray(ids)) {
        throw new Error('Input is not an array');
    }
    return ids.map(id => toObjectIdString(id));
}

export function isAuthenticatedRequest(req: Request): req is Request & { user: User } {
    if (!req.user) return false;

    return isPlainUser(req.user);
}

export function getUserFromRequest(req: Request): User {
    if (!isAuthenticatedRequest(req)) {
        throw new Error('User not found in request');
    }
    return req.user;
}

export function getUserIdFromRequest(req: Request): Types.ObjectId {
    const user = getUserFromRequest(req);
    return user._id;
}