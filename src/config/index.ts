import dotenv from 'dotenv';
import { configSchema, Config } from './schema';

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

// Zod уже проверил обязательные поля, так что эта функция теперь для логирования
export function logConfigValidation(): void {
    console.log('   Конфигурация успешно загружена:');
    console.log(`   Port: ${config.port}`);
    console.log(`   MongoDB: ${config.mongoUri.includes('localhost') ? 'local' : 'remote'}`);
    console.log(`   JWT: настроен (expires in: ${config.jwtAccessExpiresIn})`);
    console.log(`   Google OAuth: настроен`);
    console.log(`   Selectel S3: ${isSelectelConfigured() ? 'настроен' : 'не настроен'}`);

    if (!isSelectelConfigured()) {
        console.warn('   Selectel S3 не настроен - файлы будут сохраняться в памяти');
    }
}

// Вспомогательные функции для Selectel (оставляем т.к. они полезны)
export function isSelectelConfigured(): boolean {
    return !!(config.selectel.accessKeyId &&
        config.selectel.secretAccessKey &&
        config.selectel.bucketName);
}

export function getSelectelPublicUrl(key: string): string {
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    return `${config.selectel.publicUrl}/${cleanKey}`;
}