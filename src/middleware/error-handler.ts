import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';
import { COMMON_MESSAGES } from '../shared/constants/messages';

// Единственное место, где ошибки долетают до клиента. Без него Express использует свой
// дефолтный error handler, который в dev-режиме отдаёт сырой HTML со стектрейсом и
// путями файлов на сервере — реальная утечка информации об инфраструктуре наружу.
// Параметры именно четыре (даже неиспользуемый _next) — так Express отличает
// error-middleware от обычного, по arity функции, а не по названию/декоратору.
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Сюда долетают только по-настоящему непредвиденные ошибки (баг в коде, обрыв связи с БД
  // и т.п.) — details/stack логируем на сервере для отладки, клиенту отдаём нейтральный текст.
  console.error('Необработанная ошибка:', err);

  res.status(500).json({ error: COMMON_MESSAGES.ERROR.INTERNAL_SERVER_ERROR });
};
