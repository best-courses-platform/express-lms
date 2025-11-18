// domains/auth/auth.constants.ts
import { COMMON_MESSAGES } from '../../shared/constants/messages';

export const AUTH_MESSAGES = {
    VALIDATION: COMMON_MESSAGES.VALIDATION,
    SUCCESS: {
        REGISTERED: "Регистрация успешна",
        LOGGED_IN: "Вход выполнен успешно",
        LOGGED_OUT: "Выход выполнен успешно",
        TOKENS_REFRESHED: "Токены обновлены",
        PROFILE_UPDATED: "Профиль обновлен",
        PASSWORD_CHANGED: "Пароль успешно изменен"
    },
    ERROR: {
        ...COMMON_MESSAGES.ERROR,
        INVALID_CREDENTIALS: "Неверный email или пароль",
        INVALID_REFRESH_TOKEN: "Невалидный или просроченный refresh token",
        REFRESH_TOKEN_REQUIRED: "Refresh token отсутствует",
        AUTH_FAILED: "Ошибка аутентификации",
        AUTHENTICATION_ERROR: "Ошибка аутентификации",
        OAUTH_ERROR: "Ошибка при OAuth аутентификации",
        OAUTH_EMAIL_NOT_PROVIDED: "Email не предоставлен провайдером Google",
        GOOGLE_OAUTH_ERROR: "Ошибка Google OAuth"
    }
} as const;