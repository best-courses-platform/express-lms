// file-storage.service.ts
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command
} from "@aws-sdk/client-s3";
import { config, isSelectelConfigured, getSelectelPublicUrl } from '../../config';
import { UploadedFile, UploadOptions, MulterS3File } from './file-storage.types';
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
     * Преобразование неизвестной ошибки в читаемое сообщение
     */
    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) return error.message;
        if (typeof error === 'string') return error;
        if (error && typeof error === 'object' && 'message' in error) {
            return String((error as any).message);
        }
        return `${FILE_STORAGE_MESSAGES.ERROR.UNKNOWN_ERROR_FORMAT} (тип: ${typeof error})`;
    }

    /**
     * Получение stack trace ошибки
     */
    private getErrorStack(error: unknown): string | undefined {
        if (error instanceof Error) return error.stack;
        return undefined;
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

            // Удаляем каждый файл по отдельности
            const deletePromises = listResult.Contents.map(async (object) => {
                try {
                    const deleteCommand = new DeleteObjectCommand({
                        Bucket: config.selectel.bucketName,
                        Key: object.Key!,
                    });

                    await s3Client.send(deleteCommand);
                    return true;
                } catch (error) {
                    console.warn(
                        `${FILE_STORAGE_MESSAGES.WARN.INDIVIDUAL_FILE_DELETE_FAILED} ${object.Key}:`,
                        this.getErrorMessage(error)
                    );
                    return false;
                }
            });

            await Promise.all(deletePromises);

        } catch (error) {
            throw new AppError(500, FILE_STORAGE_MESSAGES.ERROR.FOLDER_DELETE_FAILED, {
                lessonId,
                folder,
                originalError: this.getErrorMessage(error),
                stack: this.getErrorStack(error)
            });
        }
    }

    /**
     * Универсальный метод для загрузки файлов
     */
    async uploadFile(
        fileBuffer: Buffer,
        options: UploadOptions
    ): Promise<UploadedFile> {
        const { folder, contentType } = options;
        const filename = options.filename || `file-${Date.now()}`;

        if (!isSelectelConfigured() || !this.s3Client) {
            const mockUrl = `mock://${folder}/${filename}`;
            return {
                url: mockUrl,
                originalName: filename,
                size: fileBuffer.length,
                mimeType: contentType
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
            });

            await s3Client.send(command);

            const url = getSelectelPublicUrl(key);

            return {
                url,
                originalName: filename,
                size: fileBuffer.length,
                mimeType: contentType
            };
        } catch (error) {
            throw new AppError(500, FILE_STORAGE_MESSAGES.ERROR.UPLOAD_FAILED, {
                filename,
                folder,
                contentType,
                key,
                originalError: this.getErrorMessage(error),
                stack: this.getErrorStack(error)
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
            contentType
        });
    }

    /**
     * Загрузка через Multer (для использования в middleware)
     */
    async uploadMulterFile(
        multerFile: MulterS3File,
        lessonId: string
    ): Promise<UploadedFile> {
        // Если файл уже загружен через multer-s3 (автоматическая загрузка)
        if (multerFile.location && multerFile.key) {
            return {
                url: multerFile.location,
                originalName: multerFile.originalname,
                size: multerFile.size,
                mimeType: multerFile.mimetype
            };
        }

        // Если файл в памяти (при использовании memoryStorage)
        if (multerFile.buffer) {
            return this.uploadLessonFile(
                multerFile.buffer,
                lessonId,
                multerFile.originalname,
                multerFile.mimetype
            );
        }

        // Если файл загружен, но нет location (обработка edge case)
        if (multerFile.key) {
            const url = getSelectelPublicUrl(multerFile.key);
            return {
                url,
                originalName: multerFile.originalname,
                size: multerFile.size,
                mimeType: multerFile.mimetype
            };
        }

        throw new AppError(400, FILE_STORAGE_MESSAGES.ERROR.UNSUPPORTED_FILE_FORMAT, {
            hasLocation: !!multerFile.location,
            hasKey: !!multerFile.key,
            hasBuffer: !!multerFile.buffer,
            originalName: multerFile.originalname,
            mimetype: multerFile.mimetype
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
            let key: string;

            if (fileUrl.startsWith('https://')) {
                const url = new URL(fileUrl);
                key = url.pathname.substring(1);
            } else if (fileUrl.includes('best-courses-ever/')) {
                key = fileUrl;
            } else {
                key = fileUrl;
            }

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
            throw new AppError(500, FILE_STORAGE_MESSAGES.ERROR.DELETE_FAILED, {
                fileUrl,
                originalError: this.getErrorMessage(error),
                stack: this.getErrorStack(error)
            });
        }
    }
}

export const fileStorageService = new FileStorageService();