// config/index.ts
import dotenv from 'dotenv';
import { configSchema, Config } from './schema';
import { CONFIG_MESSAGES } from './config.constants';

dotenv.config();

export const config: Config = configSchema.parse({
    port: process.env.PORT,
    mongoUri: process.env.MONGO_URI,
    // JWT
    jwtSecret: process.env.JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    // Google OAuth
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleCallbackURL: process.env.GOOGLE_CALLBACK_URL,
    // Selectel S3
    selectel: {
        accessKeyId: process.env.SELECTEL_ACCESS_KEY_ID,
        secretAccessKey: process.env.SELECTEL_SECRET_ACCESS_KEY,
        bucketName: process.env.SELECTEL_BUCKET_NAME,
        region: process.env.SELECTEL_REGION,
        endpoint: process.env.SELECTEL_ENDPOINT,
        publicUrl: process.env.SELECTEL_PUBLIC_URL
    }
});

// Упрощенная функция логирования конфигурации
export function logConfigValidation(): void {
    console.log(CONFIG_MESSAGES.SUCCESS.CONFIG_LOADED);

    if (!isSelectelConfigured()) {
        console.warn(CONFIG_MESSAGES.WARN.SELECTEL_NOT_CONFIGURED);
    }
}

// Вспомогательные функции для Selectel
export function isSelectelConfigured(): boolean {
    return !!(config.selectel.accessKeyId &&
        config.selectel.secretAccessKey &&
        config.selectel.bucketName);
}

export function getSelectelPublicUrl(key: string): string {
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    return `${config.selectel.publicUrl}/${cleanKey}`;
}