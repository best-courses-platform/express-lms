import { Types } from 'mongoose';

// Проверка на ObjectId
export function isObjectId(id: any): id is Types.ObjectId {
    return id instanceof Types.ObjectId;
}

// Проверка на строку, которую можно преобразовать в ObjectId
export function isValidObjectIdString(id: any): id is string {
    return typeof id === 'string' && Types.ObjectId.isValid(id);
}

// Преобразование в строку ObjectId
export function toObjectIdString(id: any): string {
    if (isObjectId(id)) {
        return id.toString();
    }
    if (isValidObjectIdString(id)) {
        return id;
    }
    throw new Error('Invalid ObjectId');
}

// Проверка на массив ObjectId
export function isObjectIdArray(ids: any[]): ids is Types.ObjectId[] {
    return Array.isArray(ids) && ids.every(id => isObjectId(id));
}

// Преобразование массива в строки ObjectId
export function toObjectIdStringArray(ids: any[]): string[] {
    if (!Array.isArray(ids)) {
        throw new Error('Input is not an array');
    }
    return ids.map(id => toObjectIdString(id));
}