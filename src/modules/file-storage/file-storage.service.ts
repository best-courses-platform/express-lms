import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command
} from "@aws-sdk/client-s3";
import { config, isSelectelConfigured, getSelectelPublicUrl } from '../../config/config';
import { UploadedFile, UploadOptions, MulterS3File } from './file-storage.types';

export class FileStorageService {
    private s3Client: S3Client | null = null;

    constructor() {
        if (isSelectelConfigured()) {
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
     * Удаление всей папки урока из S3
     */
    async deleteLessonFolder(lessonId: string): Promise<void> {
        if (!isSelectelConfigured() || !this.s3Client) {
            console.log('Selectel не настроен, пропускаем удаление папки урока');
            return;
        }

        const folder = `lessons/${lessonId}/`;
        console.log(`Удаление папки урока: ${folder}`);

        try {
            // 1. Получаем список всех файлов в папке
            const listCommand = new ListObjectsV2Command({
                Bucket: config.selectel.bucketName,
                Prefix: folder,
            });

            const listResult = await this.s3Client.send(listCommand);

            if (!listResult.Contents || listResult.Contents.length === 0) {
                console.log(`Папка урока ${folder} пуста`);
                return;
            }

            console.log(`Найдено файлов для удаления: ${listResult.Contents.length}`);

            // 2. Удаляем каждый файл по отдельности
            const deletePromises = listResult.Contents.map(async (object) => {
                try {
                    const deleteCommand = new DeleteObjectCommand({
                        Bucket: config.selectel.bucketName,
                        Key: object.Key!,
                    });

                    await this.s3Client!.send(deleteCommand);
                    console.log(`✓ Удален: ${object.Key}`);
                    return true;
                } catch (error) {
                    console.error(`✗ Ошибка удаления ${object.Key}:`, error);
                    return false;
                }
            });

            // 3. Ждем завершения всех операций удаления
            const results = await Promise.all(deletePromises);
            const successCount = results.filter(Boolean).length;

            console.log(`Удаление завершено: ${successCount}/${listResult.Contents.length} файлов`);

        } catch (error) {
            console.error('Ошибка при удалении папки урока:', error);
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

        console.log(`Начало загрузки файла: ${filename} в папку: ${folder}`);

        if (!isSelectelConfigured() || !this.s3Client) {
            console.warn('Selectel не настроен, используем mock storage');
            const mockUrl = `mock://${folder}/${filename}`;
            console.log(`Mock URL: ${mockUrl}`);
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

        console.log(`Загрузка в S3: ${key}`);
        console.log(`Bucket: ${config.selectel.bucketName}, ContentType: ${contentType}`);

        try {
            const command = new PutObjectCommand({
                Bucket: config.selectel.bucketName,
                Key: key,
                Body: fileBuffer,
                ContentType: contentType,
            });

            const result = await this.s3Client.send(command);
            console.log('S3 upload result:', result);

            const url = getSelectelPublicUrl(key);
            console.log(`Файл успешно загружен в S3: ${url}`);

            return {
                url,
                originalName: filename,
                size: fileBuffer.length,
                mimeType: contentType
            };
        } catch (error) {
            console.error('Ошибка загрузки в S3:', error);
            throw error;
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
        console.log('Обработка multer файла:', {
            originalname: multerFile.originalname,
            location: multerFile.location,
            key: multerFile.key,
            size: multerFile.size,
            mimetype: multerFile.mimetype,
            buffer: !!multerFile.buffer
        });

        // Если файл уже загружен через multer-s3 (автоматическая загрузка)
        if (multerFile.location && multerFile.key) {
            console.log('Файл уже загружен через multer-s3:', multerFile.location);
            return {
                url: multerFile.location,
                originalName: multerFile.originalname,
                size: multerFile.size,
                mimeType: multerFile.mimetype
            };
        }

        // Если файл в памяти (при использовании memoryStorage)
        if (multerFile.buffer) {
            console.log('Загрузка файла из memory buffer');
            return this.uploadLessonFile(
                multerFile.buffer,
                lessonId,
                multerFile.originalname,
                multerFile.mimetype
            );
        }

        // Если файл загружен, но нет location (обработка edge case)
        if (multerFile.key) {
            console.log('Файл имеет key, но нет location. Генерируем URL из key:', multerFile.key);
            const url = getSelectelPublicUrl(multerFile.key);
            return {
                url,
                originalName: multerFile.originalname,
                size: multerFile.size,
                mimeType: multerFile.mimetype
            };
        }

        console.error('Multer file structure:', multerFile);
        throw new Error(`Не поддерживаемый тип хранения multer файла. location: ${multerFile.location}, key: ${multerFile.key}, buffer: ${!!multerFile.buffer}`);
    }

    /**
     * Удаление файла
     */
    async deleteFile(fileUrl: string): Promise<void> {
        if (!isSelectelConfigured() || !this.s3Client) {
            console.log('Selectel не настроен, пропускаем удаление файла');
            return;
        }

        if (!fileUrl || fileUrl.startsWith('mock://')) {
            console.log('Mock URL или пустой URL, пропускаем удаление:', fileUrl);
            return;
        }

        try {
            console.log(`Попытка удаления файла: ${fileUrl}`);

            let key: string;

            if (fileUrl.startsWith('https://')) {
                const url = new URL(fileUrl);
                key = url.pathname.substring(1);
                console.log(`Извлечен ключ из URL: ${key}`);
            } else if (fileUrl.includes('best-courses-ever/')) {
                key = fileUrl;
                console.log(`Используется как ключ: ${key}`);
            } else {
                key = fileUrl;
                console.log(`Простой ключ: ${key}`);
            }

            if (key.startsWith(`${config.selectel.bucketName}/`)) {
                key = key.replace(`${config.selectel.bucketName}/`, '');
                console.log(`Очищенный ключ: ${key}`);
            }

            console.log(`Удаление из S3 по ключу: ${key}`);

            const command = new DeleteObjectCommand({
                Bucket: config.selectel.bucketName,
                Key: key,
            });

            const result = await this.s3Client.send(command);
            console.log(`Файл успешно удален из S3: ${key}`);
        } catch (error) {
            console.error('Ошибка при удалении файла из S3:', error);
        }
    }
}

export const fileStorageService = new FileStorageService();