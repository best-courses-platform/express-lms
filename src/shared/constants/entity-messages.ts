// shared/constants/entity-messages.ts
export const ENTITY_MESSAGES = {
    NOT_FOUND: (entity: string) => `${entity} не найден`,
    ID_REQUIRED: (entity: string) => `ID ${entity} обязателен`,
    ALREADY_EXISTS: (entity: string) => `${entity} уже существует`,
    ACCESS_DENIED: (entity: string) => `Доступ к ${entity} запрещен`,
} as const;

// Общие валидационные правила для сущностей
export const ENTITY_VALIDATION = {
    FIELD_REQUIRED: (field: string, entity: string) => `${field} ${entity} обязательно`,
    FIELD_TOO_LONG: (field: string, entity: string, maxLength: number)=> `${field} ${entity} не должно превышать ${maxLength} символов`,
    FIELD_TOO_SHORT: (field: string, entity: string, minLength: number) => `${field} ${entity} должно содержать не менее ${minLength} символов`,
} as const;

// Фабрики для success-сообщений
export const ENTITY_SUCCESS = {
    CREATED: (entity: string) => `${entity} успешно создан`,
    UPDATED: (entity: string) => `${entity} успешно обновлен`,
    DELETED: (entity: string) => `${entity} успешно удален`,
} as const;