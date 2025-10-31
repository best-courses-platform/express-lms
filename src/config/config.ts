import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/best-courses-ever',

    // JWT настройки
    jwtSecret: process.env.JWT_SECRET || '',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || '',
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '8h',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    // jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1m',
    // jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '5m',

    // Google OAuth
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleCallbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',

    // Selectel S3 Storage
    selectel: {
        accessKeyId: process.env.SELECTEL_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.SELECTEL_SECRET_ACCESS_KEY || '',
        bucketName: process.env.SELECTEL_BUCKET_NAME || 'best-courses-ever',
        region: process.env.SELECTEL_REGION || 'ru-1',
        endpoint: process.env.SELECTEL_ENDPOINT || 'https://s3.ru-1.storage.selcloud.ru',
        publicUrl: process.env.SELECTEL_PUBLIC_URL || 'https://best-courses-ever.s3.ru-1.storage.selcloud.ru'
    }
};

export function validateConfig() {
    console.log('Проверка конфигурации:');
    console.log('JWT_SECRET:', config.jwtSecret ? 'установлен' : 'отсутствует');
    console.log('GOOGLE_CLIENT_ID:', config.googleClientId ? 'установлен' : 'отсутствует');
    console.log('GOOGLE_CLIENT_SECRET:', config.googleClientSecret ? 'установлен' : 'отсутствует');

    // Selectel проверка
    console.log('SELECTEL_ACCESS_KEY_ID:', config.selectel.accessKeyId ? 'установлен' : 'отсутствует');
    console.log('SELECTEL_BUCKET_NAME:', config.selectel.bucketName ? 'установлен' : 'отсутствует');

    const required = ['jwtSecret', 'googleClientId', 'googleClientSecret'];
    const missing = required.filter(key => !config[key as keyof typeof config]);

    if (missing.length > 0) {
        console.warn(`Предупреждение: Отсутствуют обязательные переменные окружения: ${missing.join(', ')}`);
        return false;
    }

    // Проверка Selectel (не обязательно для разработки)
    const selectelRequired = ['accessKeyId', 'secretAccessKey', 'bucketName'];
    const selectelMissing = selectelRequired.filter(key => !config.selectel[key as keyof typeof config.selectel]);

    if (selectelMissing.length > 0) {
        console.warn(`Selectel S3 не настроен: отсутствуют ${selectelMissing.join(', ')}`);
        console.warn('Файлы будут сохраняться в памяти (только для разработки)');
    } else {
        console.log('Selectel S3 настроен');
    }

    console.log('Все обязательные переменные окружения установлены');
    return true;
}

// Вспомогательные функции для Selectel
export function isSelectelConfigured(): boolean {
    return !!(config.selectel.accessKeyId &&
        config.selectel.secretAccessKey &&
        config.selectel.bucketName);
}

export function getSelectelPublicUrl(key: string): string {
    // Убедимся, что ключ не начинается с /
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    return `${config.selectel.publicUrl}/${cleanKey}`;
}