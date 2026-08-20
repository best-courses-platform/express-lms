import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Request, Response } from 'express';
import { errorHandler } from '../error-handler';
import { AppError } from '../../utils/errors';
import { COMMON_MESSAGES } from '../../shared/constants/messages';

// Unit-слой: чистая функция без внешних зависимостей (кроме console.error) — реальный
// errorHandler, фейковые req/res/next. Единственное место, где ошибки долетают до клиента
// (см. комментарий в самом файле) — контракт стоит проверить отдельно от того, что он же
// неявно проверяется один раз на каждый модуль через интеграционные тесты (404/403/409 и т.п.).
function createMockResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Когда ошибка — AppError без details', () => {
    it('должен вернуть её status и message, без ключа details в ответе', () => {
      // Given
      const res = createMockResponse();
      const error = new AppError(404, 'Курс не найден');

      // When
      errorHandler(error, {} as Request, res, jest.fn());

      // Then
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Курс не найден' });
      expect((res.json as jest.Mock).mock.calls[0][0]).not.toHaveProperty('details');
    });

    it('не должен логировать в консоль — это ожидаемая, не непредвиденная ошибка', () => {
      const res = createMockResponse();
      errorHandler(new AppError(409, 'Уже существует'), {} as Request, res, jest.fn());

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Когда ошибка — AppError с details', () => {
    it('должен включить details в JSON-ответ', () => {
      // Given
      const res = createMockResponse();
      const details = { field: 'email', reason: 'invalid' };
      const error = new AppError(400, 'Ошибка валидации', details);

      // When
      errorHandler(error, {} as Request, res, jest.fn());

      // Then
      expect(res.json).toHaveBeenCalledWith({ error: 'Ошибка валидации', details });
    });
  });

  describe('Когда ошибка — обычный Error (непредвиденная)', () => {
    it('должен вернуть 500 с нейтральным сообщением, не пробрасывая текст исходной ошибки', () => {
      // Given — регрессия на утечку информации об инфраструктуре: клиенту не должен
      // долететь ни stack, ни message реальной ошибки (обрыв связи с БД и т.п.).
      const res = createMockResponse();
      const error = new Error('connection to mongodb://internal-host:27017 refused');

      // When
      errorHandler(error, {} as Request, res, jest.fn());

      // Then
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: COMMON_MESSAGES.ERROR.INTERNAL_SERVER_ERROR });
      const [, responseBody] = [res.status, (res.json as jest.Mock).mock.calls[0][0]];
      expect(JSON.stringify(responseBody)).not.toContain('mongodb://internal-host');
    });

    it('должен залогировать исходную ошибку на сервере для отладки', () => {
      const res = createMockResponse();
      const error = new Error('unexpected failure');

      errorHandler(error, {} as Request, res, jest.fn());

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(String), error);
    });
  });

  describe('Когда брошено не-Error значение (например, строка или undefined)', () => {
    it('не должен упасть сам — тоже должен вернуть 500 с нейтральным сообщением', () => {
      const res = createMockResponse();

      expect(() => errorHandler('какой-то мусор', {} as Request, res, jest.fn())).not.toThrow();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: COMMON_MESSAGES.ERROR.INTERNAL_SERVER_ERROR });
    });
  });
});
