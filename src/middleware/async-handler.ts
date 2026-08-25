import { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 не подписывается на отклонённый промис из async-хендлера сам — без этой обёртки
// каждый async-контроллер был бы обязан руками try/catch → next(e), иначе реджект превращался
// бы в UnhandledPromiseRejectionWarning, а запрос зависал бы без ответа. Обёртка переносит
// try/catch в одно место на всё приложение: fn может ничего не знать про next вовсе.
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
