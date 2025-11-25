// middleware/validate.ts
import { z, ZodError, ZodObject } from 'zod';
import { RequestHandler } from 'express';
import { COMMON_MESSAGES } from '../shared/constants/messages';

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

      req.validatedData = result[source];
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next({
          status: 400,
          message: COMMON_MESSAGES.ERROR.VALIDATION_ERROR,
          details: error.flatten(),
        });
      }
      next(error);
    }
  };
};
