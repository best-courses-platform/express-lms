import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePostboxEvent, toSuppressions } from '../postbox-events';

// Контрактные тесты на НАСТОЯЩИХ событиях Postbox: файлы в fixtures/ сняты из живого потока Data
// Streams (адреса, IP и идентификаторы обезличены). Документация уже расходилась с реальностью
// (подтип отказа "Spam" в ней нет), а тесты на выдуманных payload этого не увидели бы. Если Postbox
// изменит формат, обновить фикстуру можно, заново сняв событие из потока (Yandex Cloud/4, «Просмотр
// данных»), а падение этого теста покажет, что политика опирается на изменившиеся поля.
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf-8'));
}

function parseFixture(name: string) {
  const event = parsePostboxEvent(JSON.stringify(fixture(name)));
  if (!event) {
    throw new Error(`Фикстура ${name} не разобралась как событие Postbox`);
  }
  return event;
}

describe('контракт: настоящие события Postbox', () => {
  describe('bounce-permanent.json — отказ на bounce@simulator.pstbx.ru', () => {
    it('содержит поля, на которые опирается политика', () => {
      const event = parseFixture('bounce-permanent.json');

      expect(event.eventType).toBe('Bounce');
      expect(typeof event.eventId).toBe('string');
      expect(typeof event.mail?.messageId).toBe('string');
      expect(event.bounce?.bounceType).toBe('Permanent');
      expect(typeof event.bounce?.bounceSubType).toBe('string');
      expect(typeof event.bounce?.bouncedRecipients?.[0]?.emailAddress).toBe('string');
      expect(Array.isArray(event.bounce?.dialAttempts)).toBe(true);
    });

    it('адрес вносится в список подавления с причиной bounce', () => {
      const [entry, ...rest] = toSuppressions(parseFixture('bounce-permanent.json'));

      expect(rest).toEqual([]);
      expect(entry).toMatchObject({
        email: 'bounce+fixture@simulator.pstbx.ru',
        reason: 'bounce',
        eventId: expect.any(String),
        messageId: expect.any(String),
      });
    });
  });

  describe('bounce-spam.json — отказ "сочли спамом" на spam@simulator.pstbx.ru', () => {
    it('приходит с подтипом Spam (в документации Postbox его нет) — адрес НЕ подавляется', () => {
      const event = parseFixture('bounce-spam.json');

      expect(event.bounce?.bounceSubType).toBe('Spam');
      expect(toSuppressions(event)).toEqual([]);
    });
  });

  describe('delivery.json — успешная доставка', () => {
    it('разбирается как событие и ничего не подавляет', () => {
      const event = parseFixture('delivery.json');

      expect(event.eventType).toBe('Delivery');
      expect(toSuppressions(event)).toEqual([]);
    });
  });
});
