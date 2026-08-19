import multer from 'multer';
import { S3Client } from '@aws-sdk/client-s3';
import multerS3 from 'multer-s3';
import { Request } from 'express';
import { config, isSelectelConfigured } from '../config';
import { FILE_STORAGE_MESSAGES } from 'file-storage/file-storage.constants';
import { AppError } from '../utils/errors';

interface UploadRequest extends Request {
  params: {
    courseId?: string;
    lessonId?: string;
  };
}

// Функция для безопасного получения S3 клиента
const createS3Client = (): S3Client => {
  if (!config.selectel.accessKeyId || !config.selectel.secretAccessKey) {
    throw new AppError(500, FILE_STORAGE_MESSAGES.ERROR.SELECTEL_CREDENTIALS_MISSING);
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
      fileSize: isSmallFile ? FILE_STORAGE_MESSAGES.FILE_LIMITS.SMALL : FILE_STORAGE_MESSAGES.FILE_LIMITS.LARGE,
    },
    fileFilter: (req: UploadRequest, file, cb) => {
      const allowedMimeTypes = isSmallFile
        ? FILE_STORAGE_MESSAGES.MIME_TYPES.SMALL
        : FILE_STORAGE_MESSAGES.MIME_TYPES.LARGE;

      const isValidType = allowedMimeTypes.some(type => file.mimetype.startsWith(type) || file.mimetype === type);

      if (isValidType) {
        cb(null, true);
      } else {
        const error = isSmallFile
          ? new AppError(400, FILE_STORAGE_MESSAGES.ERROR.INVALID_FILE_TYPE_SMALL, {
              mimetype: file.mimetype,
              allowedTypes: FILE_STORAGE_MESSAGES.MIME_TYPES.SMALL,
            })
          : new AppError(400, FILE_STORAGE_MESSAGES.ERROR.INVALID_FILE_TYPE_LARGE, {
              mimetype: file.mimetype,
              allowedTypes: FILE_STORAGE_MESSAGES.MIME_TYPES.LARGE,
            });
        cb(error);
      }
    },
  };

  // Если Selectel настроен, используем S3 storage для автоматической загрузки
  if (isSelectelConfigured()) {
    try {
      const s3Client = createS3Client();

      baseConfig.storage = multerS3({
        s3: s3Client,
        bucket: config.selectel.bucketName,
        // Без этого multer-s3 не прокидывает MIME-тип в PutObject — все файлы уходят
        // в S3 с Content-Type: application/octet-stream, из-за чего <video> отказывается
        // проигрывать загруженные уроки (браузер не распознаёт октет-стрим как медиа).
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req: UploadRequest, file, cb) {
          cb(null, {
            fieldName: file.fieldname,
            originalName: file.originalname,
            mimeType: file.mimetype,
          });
        },
        key: function (req: UploadRequest, file, cb) {
          const lessonId = req.params.lessonId;

          if (!lessonId) {
            return cb(new AppError(400, FILE_STORAGE_MESSAGES.ERROR.LESSON_ID_REQUIRED));
          }

          const timestamp = Date.now();
          const randomString = Math.random().toString(36).substring(2, 15);
          const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');

          const filename = `${timestamp}-${randomString}-${safeFileName}`;
          const folder = `lessons/${lessonId}`;

          const fullPath = `${folder}/${filename}`;
          cb(null, fullPath);
        },
      });
    } catch (error) {
      // Если не удалось создать S3 клиент, пробрасываем ошибку дальше
      throw new AppError(500, FILE_STORAGE_MESSAGES.ERROR.S3_CLIENT_CREATION_FAILED, {
        originalError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else {
    // Если Selectel не настроен, используем memory storage
    // FileStorageService сам обработает загрузку через свой механизм
    baseConfig.storage = multer.memoryStorage();
  }

  return baseConfig;
};

export const uploadFile = multer(createMulterConfig(false));
export const uploadSmallFilesMiddleware = multer(createMulterConfig(true));

// Обложка курса: всегда memoryStorage, не multer-s3 — курса ещё нет в БД на момент
// загрузки (создаётся формой на фронтенде ДО POST /api/courses), поэтому нет lessonId-
// подобного идентификатора для multer-s3 key(). Дальше буфер уходит в
// fileStorageService.uploadFile() — тот же путь, что multer-s3 использует под капотом
// (PutObjectCommand + ACL: public-read + getSelectelPublicUrl), просто без прямого стрима.
export const uploadImage = multer({
  limits: { fileSize: FILE_STORAGE_MESSAGES.FILE_LIMITS.SMALL },
  fileFilter: (_req, file, cb) => {
    const isValidType = FILE_STORAGE_MESSAGES.MIME_TYPES.IMAGE.some(type => file.mimetype.startsWith(type));

    if (isValidType) {
      cb(null, true);
    } else {
      cb(new AppError(400, FILE_STORAGE_MESSAGES.ERROR.INVALID_FILE_TYPE_IMAGE, { mimetype: file.mimetype }));
    }
  },
  storage: multer.memoryStorage(),
});
