import { COMMON_MESSAGES } from '../../shared/constants/messages';
import { ENTITY_MESSAGES } from '../../shared/constants/entity-messages';

export const ENROLLMENT_MESSAGES = {
  VALIDATION: {
    ...COMMON_MESSAGES.VALIDATION,
    EMAIL_REQUIRED: 'Email студента обязателен',
    EMAIL_INVALID: 'Некорректный email',
    COURSE_ID_REQUIRED: ENTITY_MESSAGES.ID_REQUIRED('курса'),
    COURSE_ID_INVALID: ENTITY_MESSAGES.ID_INVALID('курса'),
    USER_ID_REQUIRED: ENTITY_MESSAGES.ID_REQUIRED('пользователя'),
    USER_ID_INVALID: ENTITY_MESSAGES.ID_INVALID('пользователя'),
  },
  ERROR: {
    ...COMMON_MESSAGES.ERROR,
    COURSE_NOT_FOUND: ENTITY_MESSAGES.NOT_FOUND('Курс'),
    NOT_AUTHOR: 'Только автор курса может управлять записью на курс',
    USER_NOT_FOUND: 'Пользователь с таким email не найден',
    NOT_ENROLLED: 'Пользователь не записан на этот курс',
  },
  SUCCESS: {
    ENROLLED: 'Пользователь успешно записан на курс',
    UNENROLLED: 'Пользователь успешно отчислен с курса',
  },
} as const;
