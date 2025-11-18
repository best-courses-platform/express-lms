// config/config.constants.ts
export const CONFIG_MESSAGES = {
    SUCCESS: {
        CONFIG_LOADED: "Конфигурация загружена",
        MONGO_CONNECTED: "MongoDB подключена",
        HTTP_DEV_STARTED: "HTTP сервер запущен",
        HTTPS_PROD_STARTED: "HTTPS сервер запущен",
        HTTP_PROD_STARTED: "HTTP сервер запущен",
        APP_CLOSED: "Приложение закрыто"
    },
    ERROR: {
        MONGO_CONNECTION_FAILED: "Ошибка подключения к MongoDB",
        APP_START_FAILED: "Не удалось запустить приложение",
        SSL_CERTS_MISSING: "SSL сертификаты не найдены",
        JWT_SECRET_REQUIRED: "JWT_SECRET обязателен",
        GOOGLE_CLIENT_ID_REQUIRED: "GOOGLE_CLIENT_ID обязателен",
        GOOGLE_CLIENT_SECRET_REQUIRED: "GOOGLE_CLIENT_SECRET обязателен"
    },
    INFO: {
        STARTING_DEV: "Запуск разработки",
        STARTING_PROD: "Запуск продакшена"
    },
    WARN: {
        SELECTEL_NOT_CONFIGURED: "Selectel S3 не настроен - файлы будут сохраняться в памяти"
    }
} as const;