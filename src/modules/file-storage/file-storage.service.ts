// services/file-storage.service.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { config, isSelectelConfigured, getSelectelPublicUrl } from '../../config/config';

export interface UploadedFile {
    url: string;
    originalName: string;
    size: number;
    mimeType: string;
}

export class FileStorageService {
    private s3Client: S3Client | null = null;

    constructor() {
        if (isSelectelConfigured()) {
            this.s3Client = new S3Client({
                region: config.selectel.region, // "ru-1"
                endpoint: config.selectel.endpoint, // Selectel endpoint
                credentials: {
                    accessKeyId: config.selectel.accessKeyId,
                    secretAccessKey: config.selectel.secretAccessKey,
                },
                forcePathStyle: false, // для vHosted стиля
            });
        }
    }

// services/file-storage.service.ts
    async uploadFile(
        file: Buffer,
        filename: string,
        contentType: string,
        folder: string
    ): Promise<UploadedFile> {
        console.log(`Начало загрузки файла: ${filename} в папку: ${folder}`);

        if (!isSelectelConfigured() || !this.s3Client) {
            console.warn('Selectel не настроен, используем mock storage');
            const mockUrl = `mock://${folder}/${filename}`;
            console.log(`Mock URL: ${mockUrl}`);
            return {
                url: mockUrl,
                originalName: filename,
                size: file.length,
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
                Body: file,
                ContentType: contentType,
            });

            const result = await this.s3Client.send(command);
            console.log('S3 upload result:', result);

            const url = getSelectelPublicUrl(key);
            console.log(`Файл успешно загружен в S3: ${url}`);

            return {
                url,
                originalName: filename,
                size: file.length,
                mimeType: contentType
            };
        } catch (error) {
            console.error('Ошибка загрузки в S3:', error);
            throw error;
        }
    }

// file-storage.service.ts
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

            // Вариант 1: Если это полный URL
            if (fileUrl.startsWith('https://')) {
                // Извлекаем ключ из полного URL
                // URL: https://best-courses-ever.s3.ru-1.storage.selcloud.ru/best-courses-ever/lessons/...
                const url = new URL(fileUrl);
                key = url.pathname.substring(1); // Убираем первый слеш
                console.log(`Извлечен ключ из URL: ${key}`);
            }
            // Вариант 2: Если это уже ключ (старая логика)
            else if (fileUrl.includes('best-courses-ever/')) {
                key = fileUrl;
                console.log(`Используется как ключ: ${key}`);
            }
            // Вариант 3: Если это простой ключ без bucket name
            else {
                key = fileUrl;
                console.log(`Простой ключ: ${key}`);
            }

            // Убедимся, что ключ не начинается с bucket name дважды
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
            // Логируем, но не прерываем выполнение
        }
    }
}

export const fileStorageService = new FileStorageService();