import { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { COMMON_MESSAGES } from '../shared/constants/messages';

// В тестах (NODE_ENV=test) лимитеры полностью проходные: у express-rate-limit общий
// in-memory store на весь процесс, а тестовый файл легко успевает сделать 10+ запросов
// на один и тот же auth-роут (например, несколько сценариев для /register в одном файле) —
// без обхода тесты начали бы падать не из-за бага в проверяемом коде, а из-за исчерпанного
// лимита, унаследованного от прод-настроек, никак не относящихся к тестовому сценарию.
const isTestEnv = process.env.NODE_ENV === 'test';
const passthrough: RequestHandler = (_req: Request, _res: Response, next: NextFunction) => next();

// Общий лимит на весь /api/* — базовая защита от грубого перебора/скрапинга и первая линия
// от DoS. Достаточно щедрый, чтобы не мешать нормальному использованию.
export const apiRateLimiter = isTestEnv
  ? passthrough
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: COMMON_MESSAGES.ERROR.TOO_MANY_REQUESTS },
    });

// Отдельный, строгий лимит для чувствительных auth-эндпоинтов (login, register, refresh,
// resend-verification, request/reset password) — именно они являются мишенью для brute-force
// подбора пароля и перебора email (user enumeration через тайминг/частоту запросов).
//
// Фабрика, а не общий экземпляр: каждый вызов создаёт middleware с собственным independent
// store. Если бы все роуты делили один и тот же объект rateLimit(...), у них был бы общий
// счётчик на один и тот же IP — например, вызов /register молча тратил бы часть бюджета,
// отведённого на /login, хотя по смыслу это два разных действия с разным риском перебора.
export const authRateLimiter = () =>
  isTestEnv
    ? passthrough
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: COMMON_MESSAGES.ERROR.TOO_MANY_REQUESTS },
      });
