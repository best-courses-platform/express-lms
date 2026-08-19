import { COMMON_MESSAGES } from '../../shared/constants/messages';

export const AUTH_MESSAGES = {
  VALIDATION: COMMON_MESSAGES.VALIDATION,
  SUCCESS: {
    REGISTERED: 'Регистрация успешна',
    LOGGED_IN: 'Вход выполнен успешно',
    LOGGED_OUT: 'Выход выполнен успешно',
    TOKENS_REFRESHED: 'Токены обновлены',
    PROFILE_UPDATED: 'Профиль обновлен',
    PASSWORD_CHANGED: 'Пароль успешно изменен',
  },
  ERROR: {
    ...COMMON_MESSAGES.ERROR,
    INVALID_CREDENTIALS: 'Неверный email или пароль',
    INVALID_REFRESH_TOKEN: 'Невалидный или просроченный refresh token',
    REFRESH_TOKEN_REQUIRED: 'Refresh token отсутствует',
    AUTH_FAILED: 'Ошибка аутентификации',
    AUTHENTICATION_ERROR: 'Ошибка аутентификации',
    OAUTH_EMAIL_NOT_PROVIDED: 'Email не предоставлен провайдером',
    GOOGLE_OAUTH_ERROR: 'Ошибка Google OAuth',
    GITHUB_EMAIL_NOT_PROVIDED:
      'Не удалось получить email. Пожалуйста, проверьте настройки приватности в GitHub или укажите публичный email.',
    GITHUB_EMAIL_FETCH_ERROR: 'Ошибка получения email из GitHub',
    GITHUB_OAUTH_ERROR: 'Ошибка GitHub OAuth',

    EMAIL_NOT_VERIFIED: 'Email не подтвержден. Проверьте вашу почту.',
    EMAIL_ALREADY_VERIFIED: 'Email уже подтвержден',
    INVALID_VERIFICATION_TOKEN: 'Неверный токен подтверждения',
    VERIFICATION_TOKEN_EXPIRED: 'Срок действия токена подтверждения истек',
    INVALID_RESET_TOKEN: 'Неверный токен сброса пароля',
    RESET_TOKEN_EXPIRED: 'Срок действия токена сброса пароля истек',
    VERIFICATION_REQUIRED: 'Требуется подтверждение email',
  },
} as const;
