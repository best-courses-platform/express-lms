// middleware/upload-file.ts
import multer from 'multer';
import { S3Client } from "@aws-sdk/client-s3";
import multerS3 from 'multer-s3';
import { Request } from 'express';
import { config, isSelectelConfigured } from '../config';

interface UploadRequest extends Request {
    params: {
        courseId?: string;
        lessonId?: string;
    };
}

// Функция для безопасного получения S3 клиента
const createS3Client = () => {
    if (!config.selectel.accessKeyId || !config.selectel.secretAccessKey) {
        throw new Error('Selectel credentials are not configured');
    }

    return new S3Client({
        region: config.selectel.region,
        endpoint: config.selectel.endpoint,
        credentials: {
            accessKeyId: config.selectel.accessKeyId,
            secretAccessKey: config.selectel.secretAccessKey,
        },
        forcePathStyle: false,
    });
};

// Базовые настройки multer
const createMulterConfig = (isSmallFile: boolean = false): multer.Options => {
    const baseConfig: multer.Options = {
        limits: {
            fileSize: isSmallFile ? 10 * 1024 * 1024 : 100 * 1024 * 1024,
        },
        fileFilter: (req: UploadRequest, file, cb) => {
            const allowedMimeTypes = isSmallFile
                ? [
                    'image/',
                    'application/pdf',
                    'text/plain',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                ]
                : [
                    'video/',
                    'image/',
                    'application/pdf',
                    'application/zip',
                    'text/plain',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                ];

            const isValidType = allowedMimeTypes.some(type =>
                file.mimetype.startsWith(type) || file.mimetype === type
            );

            if (isValidType) {
                cb(null, true);
            } else {
                const errorMsg = isSmallFile
                    ? `Неверный тип файла для небольших файлов: ${file.mimetype}`
                    : `Неверный тип файла: ${file.mimetype}. Разрешенные типы: видео, изображения, PDF, ZIP, текст, Word документы, Excel файлы`;
                cb(new Error(errorMsg));
            }
        }
    };

    // Если Selectel настроен, используем S3 storage для автоматической загрузки
    if (isSelectelConfigured()) {
        try {
            const s3Client = createS3Client();

            baseConfig.storage = multerS3({
                s3: s3Client,
                bucket: config.selectel.bucketName,
                metadata: function (req: UploadRequest, file, cb) {
                    cb(null, {
                        fieldName: file.fieldname,
                        originalName: file.originalname,
                        mimeType: file.mimetype
                    });
                },
                key: function (req: UploadRequest, file, cb) {
                    const lessonId = req.params.lessonId;

                    if (!lessonId) {
                        console.error('lessonId не найден в параметрах запроса');
                        return cb(new Error('Lesson ID is required'));
                    }

                    const timestamp = Date.now();
                    const randomString = Math.random().toString(36).substring(2, 15);
                    const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');

                    // Используем lessons/{lessonId} без подпапок по типам
                    // Тип файла будет обрабатываться в сервисе
                    const filename = `${timestamp}-${randomString}-${safeFileName}`;
                    const folder = `lessons/${lessonId}`;

                    const fullPath = `${folder}/${filename}`;
                    console.log(`Автоматическая загрузка файла через multer-s3: ${fullPath}`);

                    cb(null, fullPath);
                }
            });
        } catch (error) {
            console.error('Ошибка при создании S3 клиента:', error);
            // Fallback to memory storage
            baseConfig.storage = multer.memoryStorage();
        }
    } else {
        // Иначе используем memory storage и FileStorageService обработает загрузку
        baseConfig.storage = multer.memoryStorage();
    }

    return baseConfig;
};

export const uploadFile = multer(createMulterConfig(false));
export const uploadSmallFilesMiddleware = multer(createMulterConfig(true));