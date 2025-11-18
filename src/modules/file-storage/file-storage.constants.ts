// file-storage/file-storage.constants.ts
export const FILE_STORAGE_MESSAGES = {
    ERROR: {
        // Основные ошибки файлового хранилища
        S3_CLIENT_NOT_INITIALIZED: "S3 клиент не инициализирован",
        UNSUPPORTED_FILE_FORMAT: "Неподдерживаемый формат файла",
        UPLOAD_FAILED: "Ошибка загрузки файла",
        DELETE_FAILED: "Ошибка удаления файла",
        FOLDER_DELETE_FAILED: "Ошибка удаления папки урока",
        FILE_DELETE_FAILED: "Ошибка удаления файла из папки",
        UNKNOWN_ERROR_FORMAT: "Неизвестный формат ошибки",

        // Ошибки загрузки файлов (upload-file)
        SELECTEL_CREDENTIALS_MISSING: "Учетные данные Selectel не настроены",
        LESSON_ID_REQUIRED: "ID урока обязателен",
        S3_CLIENT_CREATION_FAILED: "Не удалось создать S3 клиент",
        INVALID_FILE_TYPE_SMALL: "Неверный тип файла для небольших файлов",
        INVALID_FILE_TYPE_LARGE: "Неверный тип файла. Разрешенные типы: видео, изображения, PDF, ZIP, текст, Word документы, Excel файлы"
    },
    WARN: {
        INDIVIDUAL_FILE_DELETE_FAILED: "Не удалось удалить файл"
    },
    INFO: {
        FOLDER_DELETED: "Папка урока удалена",
        FILE_UPLOADED: "Файл загружен",
        FILE_DELETED: "Файл удален",
        S3_NOT_CONFIGURED: "S3 не настроен, используется mock-режим",
        MOCK_FILE_SKIP: "Mock URL, удаление пропущено"
    },
    // Конфигурация загрузки файлов
    FILE_LIMITS: {
        SMALL: 10 * 1024 * 1024, // 10MB
        LARGE: 100 * 1024 * 1024 // 100MB
    },
    MIME_TYPES: {
        SMALL: [
            'image/',
            'application/pdf',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ],
        LARGE: [
            'video/',
            'image/',
            'application/pdf',
            'application/zip',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ]
    }
} as const;