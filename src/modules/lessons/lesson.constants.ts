// domains/lessons/lesson.constants.ts
import { COMMON_MESSAGES } from 'shared/constants/messages';

export const LESSON_MESSAGES = {
    VALIDATION: {
        ...COMMON_MESSAGES.VALIDATION,
        TITLE_REQUIRED: "Название урока обязательно",
        TITLE_TOO_LONG: "Название урока не должно превышать 100 символов",
        DESCRIPTION_REQUIRED: "Описание урока обязательно",
        DESCRIPTION_TOO_SHORT: "Описание должно содержать не менее 10 символов",
        DESCRIPTION_TOO_LONG: "Описание не должно превышать 2000 символов",
        COURSE_ID_REQUIRED: "ID курса обязательно",
        ORDER_REQUIRED: "Порядковый номер обязателен",
        ORDER_MIN: "Порядковый номер должен быть не менее 1",
        INPUT_EXAMPLES_TOO_LONG: "Примеры входных данных не должны превышать 1000 символов",
        OUTPUT_EXAMPLES_TOO_LONG: "Примеры выходных данных не должны превышать 1000 символов",
        TAGS_TOO_MANY: "Не более 10 тегов",
        TAG_TOO_LONG: "Тег не должен превышать 30 символов",
        LESSON_ID_REQUIRED: "ID урока обязательно",
        FILE_TYPE_REQUIRED: "Тип файла обязателен",
        FILE_TYPE_INVALID: "Тип файла должен быть video или resource",
        FILE_TITLE_REQUIRED: "Название файла обязательно",
        FILE_TITLE_TOO_LONG: "Название файла не должно превышать 100 символов",
        FILE_DESCRIPTION_TOO_LONG: "Описание файла не должно превышать 500 символов",
        FILE_URL_REQUIRED: "URL файла обязателен",
        RESOURCE_INDEX_INVALID: "Индекс ресурса должен быть числом",
    },
    ERROR: {
        ...COMMON_MESSAGES.ERROR,
        LESSON_NOT_FOUND: "Урок не найден",
        LESSON_ALREADY_EXISTS: "Урок с таким названием уже существует в этом курсе",
        INVALID_LESSON_ID: "Некорректный ID урока",
        INVALID_COURSE_ID: "Некорректный ID курса",
        FILE_NOT_UPLOADED: "Файл не загружен",
        RESOURCE_NOT_FOUND: "Ресурс не найден",
        ACCESS_DENIED: "Доступ к уроку запрещен",
    },
    SUCCESS: {
        LESSON_CREATED: "Урок успешно создан",
        LESSON_UPDATED: "Урок успешно обновлен",
        LESSON_DELETED: "Урок успешно удален",
        FILE_UPLOADED: "Файл успешно загружен",
        FILE_DELETED: "Файл успешно удален",
        RESOURCE_DELETED: "Ресурс успешно удален",
        ACCESS_GRANTED: "Доступ к уроку предоставлен"
    },
    LOGS: {
        FILE_RECEIVED: "Получен файл через multer:",
        FILE_PROCESSED: "Файл обработан:",
        CLEANUP_STARTED: "Начало очистки файлов урока из S3",
        CLEANUP_COMPLETED: "Файлы урока успешно удалены из S3",
        CLEANUP_ERROR: "Ошибка при удалении файлов урока из S3:",
        VIDEO_REPLACED: "Замена видео для урока",
        VIDEO_ADDED: "Добавление видео для урока",
        OLD_VIDEO_DELETED: "Старое видео удалено:",
        OLD_VIDEO_DELETE_ERROR: "Ошибка при удалении старого видео:",
        RESOURCE_REPLACED: "Замена существующего ресурса:",
        RESOURCE_ADDED: "Добавление нового ресурса:",
        OLD_RESOURCE_DELETED: "Старый файл ресурса удален:",
        OLD_RESOURCE_DELETE_ERROR: "Ошибка при удалении старого файла ресурса:",
        RESOURCE_FILE_DELETED: "Файл ресурса удален:",
        RESOURCE_DELETE_ERROR: "Ошибка при удалении файла из хранилища:"
    }
} as const;