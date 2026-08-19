import { z, ZodError, ZodObject } from 'zod';
import { RequestHandler } from 'express';
import { COMMON_MESSAGES } from '../shared/constants/messages';
import { AppError } from '../utils/errors';

type ValidationSource = 'body' | 'params' | 'query' | 'cookies';

// Убираем дженерик и используем конкретный тип
export const validate = (
  schema: ZodObject<{
    body?: z.ZodTypeAny;
    params?: z.ZodTypeAny;
    query?: z.ZodTypeAny;
    cookies?: z.ZodTypeAny;
  }>,
  source: ValidationSource = 'body'
): RequestHandler => {
  return (req, _res, next) => {
    try {
      const result = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
        cookies: req.cookies,
      });

      // Подставляем разобранные (и очищенные от лишних полей) данные обратно в req.
      // Без этого Zod проверяет копию, а контроллеры продолжают читать необработанный
      // req.body — то есть лишние поля (role, author и т.п.) всё равно долетают до сервиса.
      if (result.body !== undefined) {
        req.body = result.body;
      }
      if (result.params !== undefined) {
        req.params = result.params as typeof req.params;
      }
      if (result.query !== undefined) {
        req.query = result.query as typeof req.query;
      }

      req.validatedData = result[source];

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new AppError(400, COMMON_MESSAGES.ERROR.VALIDATION_ERROR, error.flatten()));
      }
      next(error);
    }
  };
};
