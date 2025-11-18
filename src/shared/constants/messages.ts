// shared/constants/messages.ts
export const COMMON_MESSAGES = {
    VALIDATION: {
        NAME_REQUIRED: "Имя обязательно для заполнения",
        NAME_TOO_LONG: "Имя не должно превышать 100 символов",
        EMAIL_INVALID: "Неверный формат email",
        EMAIL_REQUIRED: "Email обязателен для заполнения",
        PASSWORD_TOO_SHORT: "Пароль должен быть не менее 6 символов",
        PASSWORD_TOO_LONG: "Пароль не должен превышать 30 символов",
        PASSWORD_REQUIRED: "Пароль обязателен",
        CONFIRM_PASSWORD_REQUIRED: "Подтверждение пароля обязательно",
        PASSWORDS_DONT_MATCH: "Пароли не совпадают",
        CURRENT_PASSWORD_REQUIRED: "Текущий пароль обязателен",
        NEW_PASSWORD_REQUIRED: "Новый пароль обязателен",
        USER_ID_REQUIRED: "ID пользователя обязательно",
        COURSE_ID_REQUIRED: "ID курса обязательно",
        LESSON_ID_REQUIRED: "ID урока обязательно",
        TAGS_TOO_MANY: "Не более 10 тегов",
        TAG_TOO_LONG: "Тег не должен превышать 30 символов",
        AT_LEAST_ONE_FIELD: "Хотя бы одно поле должно быть заполнено",
        AVATAR_INVALID: "Аватар должен быть валидной ссылкой"
    },
    ERROR: {
        NOT_FOUND: "Ресурс не найден",
        LESSON_NOT_FOUND: "Урок не найден",
        UNAUTHORIZED: "Не авторизован",
        FORBIDDEN: "Доступ запрещен",
        INTERNAL_SERVER_ERROR: "Внутренняя ошибка сервера",
        VALIDATION_ERROR: "Ошибка валидации",
        NOT_AUTHOR: "Только автор курса может выполнять это действие",
    }
} as const;