import { COMMON_MESSAGES } from '../../shared/constants/messages';
import { ENTITY_MESSAGES, ENTITY_SUCCESS } from '../../shared/constants/entity-messages';

// Срок жизни токена подтверждения email. Момент последней отправки письма восстанавливается
// как emailVerificationExpires - TTL — отдельного поля "sentAt" в схеме нет (см. auth.service.ts,
// серверная пауза между повторными отправками).
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

// Серверная пауза между письмами подтверждения одному пользователю. Пауза во фронтенде —
// только удобство UI, обойти её можно прямым запросом; настоящее ограничение — здесь.
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

export const USER_MESSAGES = {
  SUCCESS: {
    USER_CREATED: ENTITY_SUCCESS.CREATED('Пользователь'),
    USER_UPDATED: ENTITY_SUCCESS.UPDATED('Пользователь'),
    USER_DELETED: ENTITY_SUCCESS.DELETED('Пользователь'),
  },
  ERROR: {
    NOT_FOUND: ENTITY_MESSAGES.NOT_FOUND('Пользователь'),
    ALREADY_EXISTS: ENTITY_MESSAGES.ALREADY_EXISTS('Email'),
    WRONG_CURRENT_PASSWORD: 'Неверный текущий пароль',
    USER_DATA_PROCESSING_ERROR: 'Ошибка обработки данных пользователя',
    INVALID_USER_ID: 'Неверный ID пользователя',
    EMAIL_NOT_VERIFIED: 'Email не подтвержден',
    HASHING_SERVICE_BUSY: 'Сервер перегружен, попробуйте ещё раз через несколько секунд',
  },
  VALIDATION: {
    ...COMMON_MESSAGES.VALIDATION,
    INVALID_ROLE: 'Роль должна быть одной из: student, author, admin',
  },
  INFO: {
    VERIFICATION_REQUIRED: 'Для доступа к функциям необходимо подтвердить email',
  },
} as const;
