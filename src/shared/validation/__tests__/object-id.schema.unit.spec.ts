import { describe, it, expect } from '@jest/globals';
import { objectIdSchema } from '../object-id.schema';

// Регрессия на баг с коллизией роутов: литеральный path-сегмент (например, "download"),
// объявленный после /:id, никогда не достигался бы своего обработчика — Express матчит
// роуты линейно, и /:id перехватывал бы такой запрос первым. Схема должна отсекать это
// на этапе валидации params, а не только на этапе непустой строки.
describe('objectIdSchema', () => {
  const schema = objectIdSchema('id required', 'id invalid');

  describe('Когда строка — валидный ObjectId (24 hex-символа)', () => {
    it('должна пройти валидацию', () => {
      const result = schema.safeParse('507f1f77bcf86cd799439011');
      expect(result.success).toBe(true);
    });
  });

  describe('Когда строка — литеральный путь-сегмент вроде "download"', () => {
    it('должна вернуть ошибку с сообщением invalidMessage, а не пропустить как id', () => {
      const result = schema.safeParse('download');
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.issues[0].message).toBe('id invalid');
    });
  });

  describe('Когда строка пустая', () => {
    it('должна вернуть ошибку с сообщением requiredMessage, не invalidMessage', () => {
      const result = schema.safeParse('');
      expect(result.success).toBe(false);
      expect(result.success === false && result.error.issues[0].message).toBe('id required');
    });
  });

  describe('Когда строка похожа на ObjectId по длине, но содержит не-hex символы', () => {
    it('должна вернуть ошибку', () => {
      const result = schema.safeParse('507f1f77bcf86cd79943901z');
      expect(result.success).toBe(false);
    });
  });

  describe('Когда строка hex, но не 24 символа', () => {
    it('должна вернуть ошибку', () => {
      const result = schema.safeParse('507f1f77bcf86cd7994390');
      expect(result.success).toBe(false);
    });
  });
});
