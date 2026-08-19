import { COMMON_MESSAGES } from '../../shared/constants/messages';
import { ENTITY_MESSAGES, ENTITY_SUCCESS, ENTITY_VALIDATION } from '../../shared/constants/entity-messages';

export const COURSE_MESSAGES = {
  VALIDATION: {
    ...COMMON_MESSAGES.VALIDATION,
    TITLE_REQUIRED: ENTITY_VALIDATION.FIELD_REQUIRED('Название', 'курса'),
    TITLE_TOO_LONG: ENTITY_VALIDATION.FIELD_TOO_LONG('Название', 'курса', 100),
    DESCRIPTION_REQUIRED: ENTITY_VALIDATION.FIELD_REQUIRED('Описание', 'курса'),
    DESCRIPTION_TOO_SHORT: ENTITY_VALIDATION.FIELD_TOO_SHORT('Описание', 'курса', 10),
    DESCRIPTION_TOO_LONG: ENTITY_VALIDATION.FIELD_TOO_LONG('Описание', 'курса', 1000),
    PREVIEW_IMAGE_REQUIRED: 'Изображение предпросмотра обязательно',
    PREVIEW_IMAGE_INVALID: 'Изображение предпросмотра должно быть валидным URL',
    AUTHOR_REQUIRED: ENTITY_MESSAGES.ID_REQUIRED('автора'),
    DIFFICULTY_INVALID: 'Сложность должна быть: beginner, intermediate или advanced',
    RATING_REQUIRED: 'Рейтинг обязателен',
    RATING_MIN: 'Рейтинг должен быть не менее 1',
    RATING_MAX: 'Рейтинг должен быть не более 5',
  },
  ERROR: {
    ...COMMON_MESSAGES.ERROR,
    NOT_FOUND: ENTITY_MESSAGES.NOT_FOUND('Курс'),
    ALREADY_EXISTS: ENTITY_MESSAGES.ALREADY_EXISTS('Курс с таким названием'),
    LESSON_ALREADY_ADDED: 'Урок уже добавлен в курс',
    LESSON_NOT_FOUND: ENTITY_MESSAGES.NOT_FOUND('Урок в курсе'),
    USER_ALREADY_ADDED: 'Пользователь уже имеет доступ к курсу',
    USER_NOT_FOUND_IN_ALLOWED: 'Пользователь не найден в списке доступа',
    RATING_ALREADY_EXISTS: 'Вы уже оценили этот курс',
    INVALID_DIFFICULTY: 'Недопустимый уровень сложности',
  },
  SUCCESS: {
    COURSE_CREATED: ENTITY_SUCCESS.CREATED('Курс'),
    COURSE_UPDATED: ENTITY_SUCCESS.UPDATED('Курс'),
    COURSE_DELETED: ENTITY_SUCCESS.DELETED('Курс'),
    LESSON_ADDED: 'Урок успешно добавлен в курс',
    LESSON_REMOVED: 'Урок успешно удален из курса',
    USER_ADDED_TO_ALLOWED: 'Пользователь успешно добавлен в список доступа',
    USER_REMOVED_FROM_ALLOWED: 'Пользователь успешно удален из списка доступа',
    RATING_ADDED: 'Рейтинг успешно добавлен',
  },
} as const;
