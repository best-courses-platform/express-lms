// domains/courses/course.constants.ts
import { COMMON_MESSAGES } from 'shared/constants/messages';

export const COURSE_MESSAGES = {
    VALIDATION: {
        ...COMMON_MESSAGES.VALIDATION,
        TITLE_REQUIRED: "Название курса обязательно",
        TITLE_TOO_LONG: "Название курса не должно превышать 100 символов",
        DESCRIPTION_REQUIRED: "Описание курса обязательно",
        DESCRIPTION_TOO_SHORT: "Описание должно содержать не менее 10 символов",
        DESCRIPTION_TOO_LONG: "Описание не должно превышать 1000 символов",
        PREVIEW_IMAGE_REQUIRED: "Изображение предпросмотра обязательно",
        PREVIEW_IMAGE_INVALID: "Изображение предпросмотра должно быть валидным URL",
        AUTHOR_REQUIRED: "ID автора обязательно",
        TAGS_TOO_MANY: "Не более 10 тегов",
        TAG_TOO_LONG: "Тег не должен превышать 30 символов",
        DIFFICULTY_INVALID: "Сложность должна быть: beginner, intermediate или advanced",
        COURSE_ID_REQUIRED: "ID курса обязательно",
        LESSON_ID_REQUIRED: "ID урока обязательно",
        RATING_REQUIRED: "Рейтинг обязателен",
        RATING_MIN: "Рейтинг должен быть не менее 1",
        RATING_MAX: "Рейтинг должен быть не более 5",
    },
    ERROR: {
        ...COMMON_MESSAGES.ERROR,
        COURSE_NOT_FOUND: "Курс не найден",
        COURSE_ALREADY_EXISTS: "Курс с таким названием уже существует",
        LESSON_ALREADY_ADDED: "Урок уже добавлен в курс",
        LESSON_NOT_FOUND: "Урок не найден в курсе",
        USER_ALREADY_ADDED: "Пользователь уже имеет доступ к курсу",
        USER_NOT_FOUND_IN_ALLOWED: "Пользователь не найден в списке доступа",
        RATING_ALREADY_EXISTS: "Вы уже оценили этот курс",
        INVALID_DIFFICULTY: "Недопустимый уровень сложности"
    },
    SUCCESS: {
        COURSE_CREATED: "Курс успешно создан",
        COURSE_UPDATED: "Курс успешно обновлен",
        COURSE_DELETED: "Курс успешно удален",
        LESSON_ADDED: "Урок успешно добавлен в курс",
        LESSON_REMOVED: "Урок успешно удален из курса",
        USER_ADDED_TO_ALLOWED: "Пользователь успешно добавлен в список доступа",
        USER_REMOVED_FROM_ALLOWED: "Пользователь успешно удален из списка доступа",
        RATING_ADDED: "Рейтинг успешно добавлен"
    }
} as const;