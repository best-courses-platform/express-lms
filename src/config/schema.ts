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

  // Github OAuth
  githubClientId: z.string().min(1, CONFIG_MESSAGES.ERROR.GITHUB_CLIENT_ID_REQUIRED),
  githubClientSecret: z.string().min(1, CONFIG_MESSAGES.ERROR.GITHUB_CLIENT_SECRET_REQUIRED),
  githubCallbackURL: z.string().default('/api/auth/github/callback'),

  // Email (для подтверждения регистрации)
  email: z.object({
    host: z.string().optional(),
    port: z.coerce.number().default(587),
    secure: z.coerce.boolean().default(false),
    auth: z
      .object({
        user: z.string().optional(),
        pass: z.string().optional(),
      })
      .optional(),
    from: z.string().default('noreply@yourapp.com'),
    verificationUrl: z.string().default('http://localhost:3000/api/auth/verify-email'),
  }),

  // Фронтенд URL для ссылок подтверждения
  frontendUrl: z.string().url().default('http://localhost:3000'),

  // Selectel S3
  selectel: z.object({
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    bucketName: z.string().default('best-courses-ever'),
    region: z.string().default('ru-1'),
    endpoint: z.string().url().default('https://s3.ru-1.storage.selcloud.ru'),
    publicUrl: z.string().url().default('https://best-courses-ever.s3.ru-1.storage.selcloud.ru'),
  }),
});

export type Config = z.infer<typeof configSchema>;
