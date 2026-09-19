import { describe, it, expect, jest } from '@jest/globals';
import { handlePostboxEvent, parsePostboxEvent, toSuppressions, type PostboxEvent } from '../postbox-events';

// Формы событий — из документации Postbox (postbox/concepts/notification)
function bounce(overrides: Partial<NonNullable<PostboxEvent['bounce']>> = {}): PostboxEvent {
  return {
    eventType: 'Bounce',
    eventId: 'evt-1:0',
    mail: { messageId: 'msg-1' },
    bounce: {
      bounceType: 'Permanent',
      bounceSubType: 'Undetermined',
      bouncedRecipients: [{ emailAddress: 'abc@example.com', diagnosticCode: 'Other' }],
      ...overrides,
    },
  };
}

describe('parsePostboxEvent', () => {
  it('должен разобрать JSON события из байтов записи потока', () => {
    const event = parsePostboxEvent(Buffer.from(JSON.stringify({ eventType: 'Delivery', eventId: 'e:0' })));

    expect(event).toMatchObject({ eventType: 'Delivery', eventId: 'e:0' });
  });

  it.each([
    ['невалидный JSON', '{not json'],
    ['JSON без eventType', '{"a":1}'],
    ['не объект', '"строка"'],
    ['null', 'null'],
  ])('должен вернуть null: %s', (_name, raw) => {
    expect(parsePostboxEvent(raw)).toBeNull();
  });
});

describe('toSuppressions', () => {
  describe('Bounce', () => {
    it('постоянный отказ → адрес получателя вносится с причиной bounce', () => {
      expect(toSuppressions(bounce())).toEqual([
        {
          email: 'abc@example.com',
          reason: 'bounce',
          detail: 'Undetermined: Other',
          eventId: 'evt-1:0',
          messageId: 'msg-1',
        },
      ]);
    });

    it('несколько получателей → каждый вносится отдельно', () => {
      const event = bounce({
        bouncedRecipients: [{ emailAddress: 'a@example.com' }, { emailAddress: 'b@example.com' }],
      });

      expect(toSuppressions(event).map(entry => entry.email)).toEqual(['a@example.com', 'b@example.com']);
    });

    it('реальный отказ от spam@simulator.pstbx.ru (bounceSubType "Spam") не подавляет адрес', () => {
      const event = bounce({
        bounceSubType: 'Spam',
        bouncedRecipients: [{ emailAddress: 'abc@example.com', diagnosticCode: 'Message rejected under suspicion of SPAM' }],
        dialAttempts: [{ reason: 'Smtp' }],
      });

      expect(toSuppressions(event)).toEqual([]);
    });

    it.each(['InsufficientTLS', 'StartTlsNotOffered', 'TlsCertificateUntrusted', 'TlsVersionTooLow'])(
      'отказ по TLS (%s) не подавляет адрес — проблема не в получателе',
      subType => {
        expect(toSuppressions(bounce({ bounceSubType: subType }))).toEqual([]);
      }
    );

    it('отклонение как спам ("Spam detected") не подавляет адрес — проблема в письме, а не в адресе', () => {
      const event = bounce({ bouncedRecipients: [{ emailAddress: 'abc@example.com', diagnosticCode: 'Spam detected' }] });

      expect(toSuppressions(event)).toEqual([]);
    });

    it('отказ "554 5.7.1 … suspicion of SPAM" (dialAttempts.reason = Spam, как у spam@simulator) не подавляет адрес', () => {
      const event = bounce({
        bouncedRecipients: [{ emailAddress: 'abc@example.com', diagnosticCode: '554 5.7.1 Message rejected under suspicion of SPAM' }],
        dialAttempts: [{ reason: 'Spam' }],
      });

      expect(toSuppressions(event)).toEqual([]);
    });

    it.each(['InsufficientTLS', 'StartTlsNotOffered', 'TlsCertUntrusted', 'TlsVersionTooLow'])(
      'все попытки доставки провалены из-за TLS (%s) → адрес не подавляется',
      reason => {
        expect(toSuppressions(bounce({ dialAttempts: [{ reason }, { reason }] }))).toEqual([]);
      }
    );

    it('если хотя бы одна попытка закончилась отказом самого адреса (Smtp) — подавляем', () => {
      expect(toSuppressions(bounce({ dialAttempts: [{ reason: 'Spam' }, { reason: 'Smtp' }] }))).toHaveLength(1);
    });

    it('отказ адреса (Smtp, 550 user unknown) подавляется', () => {
      expect(toSuppressions(bounce({ dialAttempts: [{ reason: 'Smtp' }] }))).toHaveLength(1);
    });

    it('стоп-лист провайдера (Suppressed) отражается и в нашем списке', () => {
      expect(toSuppressions(bounce({ bounceSubType: 'Suppressed' }))).toHaveLength(1);
    });

    it('не Permanent → ничего', () => {
      expect(toSuppressions(bounce({ bounceType: 'Transient' }))).toEqual([]);
    });

    it('получатель без адреса пропускается', () => {
      expect(toSuppressions(bounce({ bouncedRecipients: [{ diagnosticCode: 'Other' }] }))).toEqual([]);
    });
  });

  describe('Complaint', () => {
    const complaint = (type?: string): PostboxEvent => ({
      eventType: 'Complaint',
      eventId: 'evt-2:0',
      mail: { messageId: 'msg-2' },
      complaint: { complainedRecipients: [{ emailAddress: 'angry@example.com' }], complaintFeedbackType: type },
    });

    it('жалоба → адрес вносится с причиной complaint и типом жалобы', () => {
      expect(toSuppressions(complaint('abuse'))).toEqual([
        { email: 'angry@example.com', reason: 'complaint', detail: 'abuse', eventId: 'evt-2:0', messageId: 'msg-2' },
      ]);
    });

    it('not-spam (ложное срабатывание) не подавляет адрес', () => {
      expect(toSuppressions(complaint('not-spam'))).toEqual([]);
    });
  });

  it.each(['Send', 'Delivery', 'DeliveryDelay', 'Open', 'Click', 'Subscription', 'Rendering Failure'])(
    'событие %s не требует подавления',
    eventType => {
      expect(toSuppressions({ eventType })).toEqual([]);
    }
  );
});

describe('handlePostboxEvent', () => {
  it('должен внести каждый адрес в список подавления и вернуть их число', async () => {
    const suppress = jest.fn<(entry: unknown) => Promise<void>>().mockResolvedValue(undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const count = await handlePostboxEvent(bounce(), { suppress });

    expect(count).toBe(1);
    expect(suppress).toHaveBeenCalledWith(expect.objectContaining({ email: 'abc@example.com', reason: 'bounce' }));
    warnSpy.mockRestore();
  });

  it('для события без подавления ничего не вызывает', async () => {
    const suppress = jest.fn<(entry: unknown) => Promise<void>>();

    expect(await handlePostboxEvent({ eventType: 'Delivery' }, { suppress })).toBe(0);
    expect(suppress).not.toHaveBeenCalled();
  });
});
