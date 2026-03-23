import { COMMON_MESSAGES } from '../../shared/constants/messages';
import { ENTITY_MESSAGES, ENTITY_SUCCESS } from '../../shared/constants/entity-messages';

export const USER_MESSAGES = {
  SUCCESS: {
    USER_CREATED: ENTITY_SUCCESS.CREATED('Пользователь'),
    USER_UPDATED: ENTITY_SUCCESS.UPDATED('Пользователь'),
    USER_DELETED: ENTITY_SUCCESS.DELETED('Пользователь'),
    EMAIL_VERIFIED: 'Email успешно подтвержден',
    PASSWORD_RESET_SENT: 'Инструкции по сбросу пароля отправлены на email',
    PASSWORD_RESET: 'Пароль успешно изменен',
    VERIFICATION_EMAIL_SENT: 'Письмо с подтверждением отправлено',
  },
  ERROR: {
    NOT_FOUND: ENTITY_MESSAGES.NOT_FOUND('Пользователь'),
    ALREADY_EXISTS: ENTITY_MESSAGES.ALREADY_EXISTS('Email'),
    WRONG_CURRENT_PASSWORD: 'Неверный текущий пароль',
    USER_DATA_PROCESSING_ERROR: 'Ошибка обработки данных пользователя',
    INVALID_USER_ID: 'Неверный ID пользователя',
    EMAIL_NOT_VERIFIED: 'Email не подтвержден',
    EMAIL_ALREADY_VERIFIED: 'Email уже подтвержден',
    INVALID_VERIFICATION_TOKEN: 'Неверный или просроченный токен подтверждения',
    INVALID_RESET_TOKEN: 'Неверный или просроченный токен сброса пароля',
    VERIFICATION_TOKEN_EXPIRED: 'Срок действия токена подтверждения истек',
    RESET_TOKEN_EXPIRED: 'Срок действия токена сброса пароля истек',
  },
  VALIDATION: {
    ...COMMON_MESSAGES.VALIDATION,
    INVALID_ROLE: 'Роль должна быть одной из: student, author, admin',
    EMAIL_VERIFICATION_REQUIRED: 'Требуется подтверждение email',
  },
  INFO: {
    VERIFICATION_REQUIRED: 'Для доступа к функциям необходимо подтвердить email',
  },
} as const;
