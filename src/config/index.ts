import dotenv from 'dotenv';
import { Config, configSchema } from './schema';
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
  // Github OAuth
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  githubCallbackURL: process.env.GITHUB_CALLBACK_URL,
  // Email
  email: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    from: process.env.EMAIL_FROM,
    verificationUrl: process.env.EMAIL_VERIFICATION_URL,
  },
  frontendUrl: process.env.FRONTEND_URL,
  // Redis
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  // Selectel S3
  selectel: {
    accessKeyId: process.env.SELECTEL_ACCESS_KEY_ID,
    secretAccessKey: process.env.SELECTEL_SECRET_ACCESS_KEY,
    bucketName: process.env.SELECTEL_BUCKET_NAME,
    region: process.env.SELECTEL_REGION,
    endpoint: process.env.SELECTEL_ENDPOINT,
    publicUrl: process.env.SELECTEL_PUBLIC_URL,
  },
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
  // publicUrl — тоже обязательное условие: без него загрузка в S3 отработает "успешно",
  // но вернёт клиенту ссылку, по которой ничего никогда не откроется (см. Obsidian —
  // именно так эта дыра и стояла необнаруженной, пока не проверили загруженный файл вживую).
  return !!(
    config.selectel.accessKeyId &&
    config.selectel.secretAccessKey &&
    config.selectel.bucketName &&
    config.selectel.publicUrl
  );
}

export function getSelectelPublicUrl(key: string): string {
  if (!config.selectel.publicUrl) {
    throw new Error('SELECTEL_PUBLIC_URL не настроен');
  }

  const cleanKey = key.startsWith('/') ? key.substring(1) : key;
  return `${config.selectel.publicUrl}/${cleanKey}`;
}
