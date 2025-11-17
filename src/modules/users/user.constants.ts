// domains/users/user.constants.ts
import { COMMON_MESSAGES } from 'shared/constants/messages';

export const USER_MESSAGES = {
    SUCCESS: {
        ...COMMON_MESSAGES.SUCCESS,
        USER_CREATED: "Пользователь успешно создан",
        USER_UPDATED: "Пользователь успешно обновлен",
        USER_DELETED: "Пользователь успешно удален",
    },
    ERROR: {
        ...COMMON_MESSAGES.ERROR,
        USER_NOT_FOUND: "Пользователь не найден",
        EMAIL_ALREADY_EXISTS: "Email уже используется",
        WRONG_CURRENT_PASSWORD: "Неверный текущий пароль",
        USER_DATA_PROCESSING_ERROR: "Ошибка обработки данных пользователя",
        INVALID_USER_ID: "Неверный ID пользователя"
    },
    VALIDATION: {
        ...COMMON_MESSAGES.VALIDATION,
        INVALID_ROLE: "Роль должна быть одной из: student, author, admin"
    }
} as const;