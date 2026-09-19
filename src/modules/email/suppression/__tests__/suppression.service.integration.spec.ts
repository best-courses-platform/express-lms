import { describe, it, expect } from '@jest/globals';
import { EmailSuppressionModel } from '../suppression.model';
import { suppressionService } from '../suppression.service';
import { handlePostboxEvent, parsePostboxEvent } from '../../events/postbox-events';

// Реальный Mongoose поверх mongodb-memory-server (см. test/setupIntegration.ts): уникальный
// индекс, upsert и нормализация адреса проверяются на настоящей БД, а не на моке репозитория.
describe('suppressionService (реальная БД)', () => {
  it('должен вносить адрес в нормализованном виде и находить его независимо от регистра и пробелов', async () => {
    await suppressionService.suppress({ email: '  Bad@Example.COM ', reason: 'bounce', detail: 'Undetermined' });

    expect(await suppressionService.isSuppressed('bad@example.com')).toBe(true);
    expect(await suppressionService.isSuppressed('BAD@example.com  ')).toBe(true);
    expect(await suppressionService.isSuppressed('other@example.com')).toBe(false);
    expect(await EmailSuppressionModel.countDocuments({ email: 'bad@example.com' })).toBe(1);
  });

  it('повторное внесение того же адреса идемпотентно (одна запись), а жалоба перезаписывает причину отказа', async () => {
    await suppressionService.suppress({ email: 'twice@example.com', reason: 'bounce' });
    await suppressionService.suppress({ email: 'twice@example.com', reason: 'bounce' });
    await suppressionService.suppress({ email: 'twice@example.com', reason: 'complaint', detail: 'abuse' });

    const records = await EmailSuppressionModel.find({ email: 'twice@example.com' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ reason: 'complaint', detail: 'abuse' });
  });

  it('адрес с плюс-меткой подавляется отдельно от основного (отказ по user+a@ не значит, что user@ мёртв)', async () => {
    await suppressionService.suppress({ email: 'user+a@example.com', reason: 'bounce' });

    expect(await suppressionService.isSuppressed('user+a@example.com')).toBe(true);
    expect(await suppressionService.isSuppressed('user@example.com')).toBe(false);
  });

  it('unsuppress должен снять блокировку и сообщить, была ли она', async () => {
    await suppressionService.suppress({ email: 'temp@example.com', reason: 'bounce' });

    expect(await suppressionService.unsuppress('TEMP@example.com')).toBe(true);
    expect(await suppressionService.isSuppressed('temp@example.com')).toBe(false);
    expect(await suppressionService.unsuppress('temp@example.com')).toBe(false);
  });

  it('событие Bounce в формате Postbox (как в документации) доходит до списка подавления', async () => {
    const raw = JSON.stringify({
      eventType: 'Bounce',
      eventId: 'jdMtnVniDeHqlQX8ygwEX:0',
      mail: { messageId: 'QA_JPkU2fkpIWdkxAOASH' },
      bounce: {
        bounceType: 'Permanent',
        bounceSubType: 'Undetermined',
        bouncedRecipients: [{ emailAddress: 'Nobody@Example.com', action: 'failed', status: '5.1.1', diagnosticCode: 'Other' }],
      },
    });

    const event = parsePostboxEvent(raw);
    const count = await handlePostboxEvent(event!, suppressionService);

    expect(count).toBe(1);
    expect(await suppressionService.isSuppressed('nobody@example.com')).toBe(true);
    const stored = await EmailSuppressionModel.findOne({ email: 'nobody@example.com' });
    expect(stored).toMatchObject({ reason: 'bounce', eventId: 'jdMtnVniDeHqlQX8ygwEX:0', messageId: 'QA_JPkU2fkpIWdkxAOASH' });
  });
});
