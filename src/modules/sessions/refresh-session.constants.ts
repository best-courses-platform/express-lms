// Раньше жили внутри AUTH_MESSAGES.ERROR (auth/auth.constants.ts) — при выносе refresh-сессий
// в отдельный модуль (см. Obsidian: Рефакторинг проблем/31, раздел 9.7) переехали сюда вместе
// с кодом, который их бросает. auth.service.ts/auth.controller.ts тоже бросают часть этих
// ошибок (например, при обмене токена или отсутствии cookie) — это нормально, обратная
// зависимость auth -> sessions уже есть и так (auth использует сам сервис), а не наоборот.
export const SESSION_MESSAGES = {
  ERROR: {
    INVALID_REFRESH_TOKEN: 'Невалидный или просроченный refresh token',
    REFRESH_TOKEN_REQUIRED: 'Refresh token отсутствует',
    SESSION_REVOKED: 'Сессия отозвана — войдите заново',
    SESSION_NOT_FOUND: 'Сессия не найдена',
  },
} as const;
