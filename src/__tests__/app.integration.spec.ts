import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { COMMON_MESSAGES } from '../shared/constants/messages';

// Единственная ветка app.ts, не покрытая ни одним из модульных интеграционных тестов —
// catch-all для несматчившихся путей (app.ts:53-55). Каждый другой тест бьёт по реальному,
// существующему роуту; ни один не проверяет, что происходит на пути, которого нет вообще.
describe('App (integration) — catch-all 404', () => {
  describe('Когда путь не соответствует ни одному роуту', () => {
    it('должен вернуть JSON 404 с тем же контрактом ошибки, что и остальной API, а не дефолтную HTML-страницу Express', async () => {
      // Given — регрессия на комментарий в app.ts: "Чисто API-бэкенд... любой не сматчившийся
      // путь — JSON 404, не дефолтная HTML-страница Express".
      const response = await request(app).get('/this/route/does/not/exist');

      // Then
      expect(response.status).toBe(404);
      expect(response.type).toBe('application/json');
      expect(response.body).toEqual({ error: COMMON_MESSAGES.ERROR.RESOURCE_NOT_FOUND });
    });

    it('должен вести себя так же для неизвестного пути внутри /api', async () => {
      const response = await request(app).get('/api/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: COMMON_MESSAGES.ERROR.RESOURCE_NOT_FOUND });
    });

    it('должен вести себя так же для не-GET методов', async () => {
      const response = await request(app).post('/totally/unknown');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: COMMON_MESSAGES.ERROR.RESOURCE_NOT_FOUND });
    });
  });
});
