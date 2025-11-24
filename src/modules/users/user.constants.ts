// domains/users/user.constants.ts
import { COMMON_MESSAGES } from '../../shared/constants/messages';
import {ENTITY_MESSAGES, ENTITY_SUCCESS} from "../../shared/constants/entity-messages";

export const USER_MESSAGES = {
    SUCCESS: {
        USER_CREATED: ENTITY_SUCCESS.CREATED("Пользователь"),
        USER_UPDATED: ENTITY_SUCCESS.UPDATED("Пользователь"),
        USER_DELETED: ENTITY_SUCCESS.DELETED("Пользователь"),
    },
    ERROR: {
        NOT_FOUND: ENTITY_MESSAGES.NOT_FOUND("Пользователь"),
        ALREADY_EXISTS: ENTITY_MESSAGES.ALREADY_EXISTS("Email"),
        WRONG_CURRENT_PASSWORD: "Неверный текущий пароль",
        USER_DATA_PROCESSING_ERROR: "Ошибка обработки данных пользователя",
        INVALID_USER_ID: "Неверный ID пользователя"
    },
    VALIDATION: {
        ...COMMON_MESSAGES.VALIDATION,
        INVALID_ROLE: "Роль должна быть одной из: student, author, admin"
    }
} as const;