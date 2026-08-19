import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { config, getSelectelPublicUrl, isSelectelConfigured } from '../../config';
import { MulterS3File, UploadedFile, UploadOptions } from './file-storage.types';
import { FILE_STORAGE_MESSAGES } from './file-storage.constants';
import { AppError } from '../../utils/errors';

export class FileStorageService {
  private s3Client: S3Client | null = null;

  constructor() {
    if (isSelectelConfigured()) {
      if (!config.selectel.accessKeyId || !config.selectel.secretAccessKey) {
        return;
      }

      this.s3Client = new S3Client({
        region: config.selectel.region,
        endpoint: config.selectel.endpoint,
        credentials: {
          accessKeyId: config.selectel.accessKeyId,
          secretAccessKey: config.selectel.secretAccessKey,
        },
        forcePathStyle: false,
      });
    }
  }

  /**
   * Безопасное получение S3 клиента
   */
  private getS3Client(): S3Client {
    if (!this.s3Client) {
      throw new AppError(500, FILE_STORAGE_MESSAGES.ERROR.S3_CLIENT_NOT_INITIALIZED);
    }
    return this.s3Client;
  }

  /**
   * Преобразование ЛЮБОЙ ошибки в стандартизированную AppError
   */
  private normalizeError(error: unknown): AppError {
    // Если ошибка уже AppError - возвращаем как есть
    if (error instanceof AppError) {
      return error;
    }

    // Если это стандартная Error - конвертируем в AppError
    if (error instanceof Error) {
      return new AppError(500, error.message, {
        originalError: error.name,
        stack: error.stack,
      });
    }

    // Если это строка - создаем AppError с этой строкой как сообщением
    if (typeof error === 'string') {
      return new AppError(500, error);
    }

    // Для любых других типов ошибок
    return new AppError(500, FILE_STORAGE_MESSAGES.ERROR.UNKNOWN_ERROR_FORMAT, {
      originalError: error,
      type: typeof error,
    });
  }

  /**
   * Удаление всей папки урока из S3
   */
  async deleteLessonFolder(lessonId: string): Promise<void> {
    if (!isSelectelConfigured() || !this.s3Client) {
      return;
    }

    const folder = `lessons/${lessonId}/`;

    try {
      const s3Client = this.getS3Client();

      // Получаем список всех файлов в папке
      const listCommand = new ListObjectsV2Command({
        Bucket: config.selectel.bucketName,
        Prefix: folder,
      });

      const listResult = await s3Client.send(listCommand);

      if (!listResult.Contents || listResult.Contents.length === 0) {
        return;
      }

      // DeleteObjectsCommand принимает до 1000 ключей за один запрос — вместо N отдельных
      // запросов к S3 (по одному на файл) делаем ceil(N/1000) batch-запросов. Для типичного
      // урока (единицы-десятки файлов) это буквально один запрос вместо N.
      const keys = listResult.Contents.map(object => object.Key!);
      const BATCH_SIZE = 1000;

      for (let i = 0; i < keys.length; i += BATCH_SIZE) {
        const batch = keys.slice(i, i + BATCH_SIZE);

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: config.selectel.bucketName,
          Delete: { Objects: batch.map(Key => ({ Key })) },
        });

        const result = await s3Client.send(deleteCommand);

        result.Errors?.forEach(err => {
          console.warn(`${FILE_STORAGE_MESSAGES.WARN.INDIVIDUAL_FILE_DELETE_FAILED} ${err.Key}:`, err.Message);
        });
      }
    } catch (error) {
      // Нормализуем ошибку и бросаем новую AppError с контекстом
      const normalizedError = this.normalizeError(error);

      // Безопасное извлечение stack из details
      const stack = (normalizedError.details as { stack?: string })?.stack;

      throw new AppError(500, FILE_STORAGE_MESSAGES.ERROR.FOLDER_DELETE_FAILED, {
        lessonId,
        folder,
        originalError: normalizedError.message,
        originalDetails: normalizedError.details,
        stack: stack,
      });
    }
  }

  /**
   * Универсальный метод для загрузки файлов
   */
  async uploadFile(fileBuffer: Buffer, options: UploadOptions): Promise<UploadedFile> {
    const { folder, contentType } = options;
    const filename = options.filename || `file-${Date.now()}`;

    if (!isSelectelConfigured() || !this.s3Client) {
      const mockUrl = `mock://${folder}/${filename}`;
      return {
        url: mockUrl,
        originalName: filename,
        size: fileBuffer.length,
        mimeType: contentType,
      };
    }

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const safeFileName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${folder}/${timestamp}-${randomString}-${safeFileName}`;

    try {
      const s3Client = this.getS3Client();

      const command = new PutObjectCommand({
        Bucket: config.selectel.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        // Без этого объект загружается с приватным ACL бакета по умолчанию, а
        // getSelectelPublicUrl() ниже всё равно строит и возвращает клиенту "публичную"
        // ссылку на него — которая на деле отдаёт 403 AccessDenied у любого, кто по ней
        // перейдёт (браузер при просмотре видео/картинки урока, а не только сторонний).
        ACL: 'public-read',
      });

      await s3Client.send(command);

      const url = getSelectelPublicUrl(key);

      return {
        url,
        originalName: filename,
        size: fileBuffer.length,
        mimeType: contentType,
      };
    } catch (error) {
      const normalizedError = this.normalizeError(error);

      const stack = (normalizedError.details as { stack?: string })?.stack;

      throw new AppError(500, FILE_STORAGE_MESSAGES.ERROR.UPLOAD_FAILED, {
        filename,
        folder,
        contentType,
        key,
        originalError: normalizedError.message,
        originalDetails: normalizedError.details,
        stack: stack,
      });
    }
  }

  /**
   * Загрузка файла урока (специализированный метод)
   */
  async uploadLessonFile(
    fileBuffer: Buffer,
    lessonId: string,
    originalName: string,
    contentType: string,
    fileType: 'video' | 'resource' = 'resource'
  ): Promise<UploadedFile> {
    const folder = `lessons/${lessonId}/${fileType}`;

    return this.uploadFile(fileBuffer, {
      folder,
      filename: originalName,
      contentType,
    });
  }

  /**
   * Загрузка через Multer (для использования в middleware)
   */
  async uploadMulterFile(multerFile: MulterS3File, lessonId: string): Promise<UploadedFile> {
    // Файл уже загружен через multer-s3 (автоматическая загрузка) — есть ключ объекта.
    // Намеренно НЕ используем multerFile.location: multer-s3 строит его сам из S3-эндпоинта
    // клиента (protocol-адрес, требующий подписи запроса на каждое чтение) — а не из
    // публичного домена бакета (SELECTEL_PUBLIC_URL). Ссылка из .location была бы
    // синтаксически похожа на рабочую, но реально недоступна анонимному GET (см. Obsidian —
    // именно так эта дыра и стояла необнаруженной весь день, пока не проверили вживую).
    if (multerFile.key) {
      const url = getSelectelPublicUrl(multerFile.key);
      return {
        url,
        originalName: multerFile.originalname,
        size: multerFile.size,
        mimeType: multerFile.mimetype,
      };
    }

    // Если файл в памяти (при использовании memoryStorage)
    if (multerFile.buffer) {
      return this.uploadLessonFile(multerFile.buffer, lessonId, multerFile.originalname, multerFile.mimetype);
    }

    // Бросаем AppError напрямую (без normalizeError, так как это не runtime ошибка)
    throw new AppError(400, FILE_STORAGE_MESSAGES.ERROR.UNSUPPORTED_FILE_FORMAT, {
      hasLocation: !!multerFile.location,
      hasKey: !!multerFile.key,
      hasBuffer: !!multerFile.buffer,
      originalName: multerFile.originalname,
      mimetype: multerFile.mimetype,
    });
  }

  /**
   * Удаление файла
   */
  async deleteFile(fileUrl: string): Promise<void> {
    if (!isSelectelConfigured() || !this.s3Client) {
      return;
    }

    if (!fileUrl || fileUrl.startsWith('mock://')) {
      return;
    }

    try {
      // Если это полный URL — вычисляем ключ из пути; иначе fileUrl уже и есть ключ.
      let key = fileUrl.startsWith('https://') ? new URL(fileUrl).pathname.substring(1) : fileUrl;

      if (key.startsWith(`${config.selectel.bucketName}/`)) {
        key = key.replace(`${config.selectel.bucketName}/`, '');
      }

      const s3Client = this.getS3Client();

      const command = new DeleteObjectCommand({
        Bucket: config.selectel.bucketName,
        Key: key,
      });

      await s3Client.send(command);
    } catch (error) {
      // Нормализуем ошибку и бросаем новую AppError
      const normalizedError = this.normalizeError(error);

      const stack = (normalizedError.details as { stack?: string })?.stack;

      throw new AppError(500, FILE_STORAGE_MESSAGES.ERROR.DELETE_FAILED, {
        fileUrl,
        originalError: normalizedError.message,
        originalDetails: normalizedError.details,
        stack: stack,
      });
    }
  }
}

export const fileStorageService = new FileStorageService();
