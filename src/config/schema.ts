// config/schema.ts
import { z } from 'zod';
import { CONFIG_MESSAGES } from './config.constants';

export const configSchema = z.object({
    port: z.coerce.number().default(3000),
    mongoUri: z.string().url().default('mongodb://localhost:27017/best-courses-ever'),

    // JWT
    jwtSecret: z.string().min(1, CONFIG_MESSAGES.ERROR.JWT_SECRET_REQUIRED),
    jwtRefreshSecret: z.string().default(() => process.env.JWT_SECRET || ''),
    jwtAccessExpiresIn: z.string().default('8h'),
    jwtRefreshExpiresIn: z.string().default('30d'),

    // Google OAuth
    googleClientId: z.string().min(1, CONFIG_MESSAGES.ERROR.GOOGLE_CLIENT_ID_REQUIRED),
    googleClientSecret: z.string().min(1, CONFIG_MESSAGES.ERROR.GOOGLE_CLIENT_SECRET_REQUIRED),
    googleCallbackURL: z.string().default('/api/auth/google/callback'),

    // Selectel S3
    selectel: z.object({
        accessKeyId: z.string().optional(),
        secretAccessKey: z.string().optional(),
        bucketName: z.string().default('best-courses-ever'),
        region: z.string().default('ru-1'),
        endpoint: z.string().url().default('https://s3.ru-1.storage.selcloud.ru'),
        publicUrl: z.string().url().default('https://best-courses-ever.s3.ru-1.storage.selcloud.ru')
    })
});

export type Config = z.infer<typeof configSchema>;