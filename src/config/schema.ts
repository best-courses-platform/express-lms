import { z } from 'zod';
import { CONFIG_MESSAGES } from './config.constants';

export const configSchema = z.object({
  port: z.coerce.number().default(3000),
  mongoUri: z.string().url().default('mongodb://localhost:27017/best-courses-ever'),

  // JWT — только access, теперь единственный JWT в системе (заметка 31: refresh стал
  // opaque-строкой в БД, не JWT — jwtRefreshSecret ему больше не нужен, см. jwt.service.ts).
  jwtSecret: z.string().min(1, CONFIG_MESSAGES.ERROR.JWT_SECRET_REQUIRED),
  // 15m — индустриальная норма для access-токена при работающей ротации refresh-сессий
  // (заметка 31): раньше было 8h как временная мера, пока на lms-web не было silent-refresh.
  jwtAccessExpiresIn: z.string().default('15m'),
  // TTL не самого JWT, а refresh-СЕССИИ в БД (RefreshSession.expiresAt) и refresh-cookie —
  // используется refresh-session.service.ts, не jwt.sign().
  jwtRefreshExpiresIn: z.string().default('30d'),

  // Pepper для паролей (см. password-hasher.worker.ts) — секрет, который НЕ хранится в БД
  // рядом с хешем (в отличие от соли), поэтому утечка одной только коллекции users не даёт
  // достаточно данных для офлайн-брутфорса. min(32) — тот же порядок величины, что и у
  // JWT-секретов в .env (обычно 64-символьный hex, то есть 32 байта энтропии).
  passwordPepper: z.string().min(32, CONFIG_MESSAGES.ERROR.PASSWORD_PEPPER_REQUIRED),

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

  // Redis — очередь фоновых задач (BullMQ). Дефолты совпадают с docker-compose.yml
  // (redis:7-alpine, порт 6379:6379), локальный dev работает без единой переменной окружения.
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.coerce.number().default(6379),
  }),

  // Selectel S3
  selectel: z.object({
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    bucketName: z.string().default('best-courses-ever'),
    region: z.string().default('ru-1'),
    // S3 API endpoint (для PutObject/DeleteObject и т.п.) — всегда требует подписи запроса,
    // Selectel не поддерживает анонимный доступ по этому адресу ни при каких настройках бакета.
    endpoint: z.string().url().default('https://s3.ru-1.storage.selcloud.ru'),
    // Публичный домен бакета — СОВСЕМ ДРУГОЙ адрес (вида https://<bucket-uuid>.selstorage.ru,
    // смотреть в панели: бакет → вкладка "Домены" → "Основной домен"), не вариация S3-эндпоинта
    // с именем бакета вместо поддомена. Раньше это было спутано (см. Obsidian) — здесь без
    // дефолта намеренно: у каждого бакета свой UUID, угадать/захардкодить нельзя.
    publicUrl: z.string().url().optional(),
  }),
});

export type Config = z.infer<typeof configSchema>;
