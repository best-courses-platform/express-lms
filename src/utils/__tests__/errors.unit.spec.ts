import { describe, it, expect } from '@jest/globals';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
} from '../errors';

// errorHandler.ts матчит только по `instanceof AppError` — вся ценность подклассов в том,
// чтобы это по-прежнему работало, при этом фиксируя статус и не давая перепутать его на
// call-site. Проверяем оба свойства для каждого класса.
describe('Именованные подклассы AppError', () => {
  const cases: Array<[string, new (message: string, details?: unknown) => AppError, number]> = [
    ['BadRequestError', BadRequestError, 400],
    ['UnauthorizedError', UnauthorizedError, 401],
    ['ForbiddenError', ForbiddenError, 403],
    ['NotFoundError', NotFoundError, 404],
    ['ConflictError', ConflictError, 409],
    ['InternalError', InternalError, 500],
  ];

  it.each(cases)(
    '%s должен быть instanceof AppError и Error, со своим фиксированным статусом',
    (_name, ErrorClass, expectedStatus) => {
      const error = new ErrorClass('сообщение');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.status).toBe(expectedStatus);
      expect(error.message).toBe('сообщение');
    }
  );

  it.each(cases)('%s должен передавать details дальше без изменений', (_name, ErrorClass) => {
    const details = { field: 'email' };
    const error = new ErrorClass('сообщение', details);

    expect(error.details).toBe(details);
  });

  describe('Когда details не передан', () => {
    it('должен остаться undefined, а не превратиться в null/{}', () => {
      const error = new NotFoundError('сообщение');
      expect(error.details).toBeUndefined();
    });
  });
});
