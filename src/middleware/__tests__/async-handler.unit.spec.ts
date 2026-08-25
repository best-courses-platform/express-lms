import { describe, it, expect, jest } from '@jest/globals';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../async-handler';

// NextFunction — перегруженная сигнатура (в т.ч. next('route')/next('router')), jest.fn<NextFunction>()
// конфликтует с ней по контравариантности параметров. Кастуем один раз здесь, а не типизируем
// каждый мок вручную.
const createNextMock = () => jest.fn() as unknown as NextFunction;

// Проверяем ровно тот механизм, ради которого обёртка существует: реджект промиса из
// async-хендлера обязан долететь до next(err), а не превратиться в
// UnhandledPromiseRejectionWarning с зависшим запросом (см. комментарий в async-handler.ts).
describe('asyncHandler', () => {
  const req = {} as Request;
  const res = {} as Response;

  describe('Когда обёрнутый хендлер резолвится успешно', () => {
    it('не должен вызывать next', async () => {
      const handler = jest.fn<RequestHandler>(async () => {});
      const next = createNextMock();

      await asyncHandler(handler)(req, res, next);

      expect(handler).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Когда обёрнутый хендлер реджектится', () => {
    it('должен передать ошибку в next, а не бросить UnhandledPromiseRejection', async () => {
      const error = new Error('boom');
      const handler = jest.fn<RequestHandler>(async () => {
        throw error;
      });
      const next = createNextMock();

      await asyncHandler(handler)(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('Когда обёрнутый хендлер синхронный и просто вызывает next() сам', () => {
    it('должен пропустить его как есть, не вмешиваясь', async () => {
      const handler = jest.fn<RequestHandler>((_req, _res, next) => next());
      const next = createNextMock();

      await asyncHandler(handler)(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });
  });
});
