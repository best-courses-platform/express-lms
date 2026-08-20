import { describe, it, expect } from '@jest/globals';
import { Types } from 'mongoose';
import type { Request } from 'express';
import {
  isMongooseDocument,
  hasComparePassword,
  isPlainUser,
  isUserDocumentStrict,
  toSafeUser,
  isUserWithPassword,
  isObjectId,
  isValidObjectIdString,
  toObjectIdString,
  isAuthenticatedRequest,
  getUserFromRequest,
  getUserIdFromRequest,
} from '../typeGuards';

// Unit-слой на чистые type guard-функции — раньше покрывались только транзитивно (через
// authService, которая гоняет их на реальных Mongoose-документах в своих тестах, и через
// access.ts middleware, которое гоняет isAuthenticatedRequest на каждом защищённом роуте) —
// это покрывало в основном happy-path-ветки. Здесь — целенаправленно failure-ветки, которые
// транзитивные вызовы почти никогда не задевают (например, кто вообще передаст в
// isAuthenticatedRequest запрос без req.user, кроме самого access.ts, который сразу же
// возвращает 401, не проверяя оставшуюся логику отдельно).
//
// Удалены как мёртвый код (не тесты, а сам код): isUserDocument (не-Strict версия — нигде
// не вызывалась, дублировала isUserDocumentStrict), hasObjectId/hasEmail/hasPassword (только
// isUserDocument их использовал), isObjectIdArray/toObjectIdStringArray (ни разу не
// импортировались за пределами этого файла). Дописывать тесты ради процента coverage на
// код, который никто не вызывает, — противоположность цели тестов.

function createMongooseLikeDocument(overrides: Record<string, unknown> = {}) {
  return {
    toObject: () => ({}),
    save: async () => undefined,
    isNew: false,
    $isNew: false,
    _doc: {},
    ...overrides,
  };
}

describe('isMongooseDocument', () => {
  describe.each([
    ['null', null],
    ['примитив (строка)', 'not-an-object'],
    ['примитив (число)', 42],
    ['undefined', undefined],
  ])('Когда передан %s', (_label, value) => {
    it('должен вернуть false', () => {
      expect(isMongooseDocument(value)).toBe(false);
    });
  });

  describe.each([
    ['toObject не функция', { toObject: 'x' }],
    ['save не функция', { save: 'x' }],
    ['isNew не boolean', { isNew: 'false' }],
    ['$isNew не boolean', { $isNew: 'false' }],
    ['_doc отсутствует', { _doc: undefined }],
  ])('Когда объект похож на документ, но %s', (_label, overrides) => {
    it('должен вернуть false', () => {
      expect(isMongooseDocument(createMongooseLikeDocument(overrides))).toBe(false);
    });
  });

  describe('Когда объект содержит все обязательные поля/методы', () => {
    it('должен вернуть true', () => {
      expect(isMongooseDocument(createMongooseLikeDocument())).toBe(true);
    });
  });
});

describe('hasComparePassword', () => {
  describe('Когда передан не объект', () => {
    it('должен вернуть false', () => {
      expect(hasComparePassword(null)).toBe(false);
      expect(hasComparePassword('x')).toBe(false);
    });
  });

  describe('Когда comparePassword отсутствует или не функция', () => {
    it('должен вернуть false', () => {
      expect(hasComparePassword({})).toBe(false);
      expect(hasComparePassword({ comparePassword: 'not-a-function' })).toBe(false);
    });
  });

  describe('Когда comparePassword бросает синхронно при вызове', () => {
    it('должен вернуть false, не пробрасывая исключение наружу', () => {
      const obj = {
        comparePassword: () => {
          throw new Error('boom');
        },
      };
      expect(hasComparePassword(obj)).toBe(false);
    });
  });

  describe('Когда comparePassword — функция, но возвращает не Promise', () => {
    it('должен вернуть false', () => {
      expect(hasComparePassword({ comparePassword: () => true })).toBe(false);
    });
  });

  describe('Когда comparePassword — функция, возвращающая Promise', () => {
    it('должен вернуть true', () => {
      expect(hasComparePassword({ comparePassword: async () => true })).toBe(true);
    });
  });
});

function createValidUserFields() {
  return {
    _id: new Types.ObjectId(),
    email: 'user@example.com',
    name: 'Test User',
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('isPlainUser', () => {
  describe('Когда передан не объект', () => {
    it('должен вернуть false', () => {
      expect(isPlainUser(null)).toBe(false);
      expect(isPlainUser(42)).toBe(false);
    });
  });

  describe.each([
    ['_id не ObjectId', { _id: 'not-an-object-id' }],
    ['email не строка', { email: 42 }],
    ['role отсутствует', { role: undefined }],
    ['createdAt не Date', { createdAt: '2024-01-01' }],
  ])('Когда обязательное поле некорректно (%s)', (_label, overrides) => {
    it('должен вернуть false', () => {
      expect(isPlainUser({ ...createValidUserFields(), ...overrides })).toBe(false);
    });
  });

  describe('Когда все обязательные поля корректны', () => {
    it('должен вернуть true', () => {
      expect(isPlainUser(createValidUserFields())).toBe(true);
    });
  });

  describe('Когда передан Mongoose-документ с валидными полями', () => {
    it('должен рекурсивно проверить результат toObject() и вернуть true', () => {
      const plain = createValidUserFields();
      const doc = createMongooseLikeDocument({ ...plain, toObject: () => plain });
      expect(isPlainUser(doc)).toBe(true);
    });

    it('должен вернуть false, если toObject() возвращает невалидный объект', () => {
      const doc = createMongooseLikeDocument({ ...createValidUserFields(), toObject: () => ({}) });
      expect(isPlainUser(doc)).toBe(false);
    });
  });
});

describe('isUserDocumentStrict', () => {
  describe('Когда объект не Mongoose-документ', () => {
    it('должен вернуть false', () => {
      expect(isUserDocumentStrict({ ...createValidUserFields(), comparePassword: async () => true })).toBe(false);
    });
  });

  describe('Когда объект — Mongoose-документ, но без comparePassword', () => {
    it('должен вернуть false', () => {
      expect(isUserDocumentStrict(createMongooseLikeDocument(createValidUserFields()))).toBe(false);
    });
  });

  describe('Когда объект — Mongoose-документ с comparePassword, но без обязательных полей User', () => {
    it('должен вернуть false', () => {
      expect(
        isUserDocumentStrict(createMongooseLikeDocument({ comparePassword: async () => true }))
      ).toBe(false);
    });
  });

  describe('Когда объект — полноценный User-документ', () => {
    it('должен вернуть true', () => {
      expect(
        isUserDocumentStrict(
          createMongooseLikeDocument({ ...createValidUserFields(), comparePassword: async () => true })
        )
      ).toBe(true);
    });
  });
});

describe('toSafeUser', () => {
  describe('Когда объект не проходит isPlainUser', () => {
    it('должен выбросить ошибку', () => {
      expect(() => toSafeUser({})).toThrow('Invalid user object');
    });
  });

  describe('Когда объект валиден', () => {
    it('должен вернуть его как есть', () => {
      const user = createValidUserFields();
      expect(toSafeUser(user)).toBe(user);
    });
  });
});

describe('isUserWithPassword', () => {
  describe('Когда объект не проходит isPlainUser', () => {
    it('должен вернуть false', () => {
      expect(isUserWithPassword({})).toBe(false);
    });
  });

  describe('Когда объект валиден, но без password', () => {
    it('должен вернуть false', () => {
      expect(isUserWithPassword(createValidUserFields())).toBe(false);
    });
  });

  describe('Когда объект валиден и password — строка', () => {
    it('должен вернуть true', () => {
      expect(isUserWithPassword({ ...createValidUserFields(), password: 'hashed' })).toBe(true);
    });
  });
});

describe('isObjectId / isValidObjectIdString / toObjectIdString', () => {
  describe('isObjectId', () => {
    it('должен вернуть true для реального Types.ObjectId', () => {
      expect(isObjectId(new Types.ObjectId())).toBe(true);
    });

    it('должен вернуть false для строки, даже валидной по формату', () => {
      expect(isObjectId('507f1f77bcf86cd799439011')).toBe(false);
    });
  });

  describe('isValidObjectIdString', () => {
    it('должен вернуть true для валидной по формату строки', () => {
      expect(isValidObjectIdString('507f1f77bcf86cd799439011')).toBe(true);
    });

    it('должен вернуть false для невалидной строки', () => {
      expect(isValidObjectIdString('not-an-id')).toBe(false);
    });

    it('должен вернуть false для не-строки', () => {
      expect(isValidObjectIdString(12345)).toBe(false);
    });
  });

  describe('toObjectIdString', () => {
    it('должен вернуть .toString() для настоящего ObjectId', () => {
      const id = new Types.ObjectId();
      expect(toObjectIdString(id)).toBe(id.toString());
    });

    it('должен вернуть валидную ObjectId-строку как есть', () => {
      expect(toObjectIdString('507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011');
    });

    it('должен выбросить ошибку для невалидного значения', () => {
      expect(() => toObjectIdString('garbage')).toThrow('Invalid ObjectId');
    });
  });
});

describe('isAuthenticatedRequest / getUserFromRequest / getUserIdFromRequest', () => {
  describe('Когда req.user отсутствует', () => {
    it('isAuthenticatedRequest должен вернуть false', () => {
      expect(isAuthenticatedRequest({} as Request)).toBe(false);
    });

    it('getUserFromRequest должен выбросить ошибку', () => {
      expect(() => getUserFromRequest({} as Request)).toThrow('User not found in request');
    });

    it('getUserIdFromRequest должен выбросить ту же ошибку', () => {
      expect(() => getUserIdFromRequest({} as Request)).toThrow('User not found in request');
    });
  });

  describe('Когда req.user — валидный User', () => {
    it('isAuthenticatedRequest должен вернуть true', () => {
      const req = { user: createValidUserFields() } as unknown as Request;
      expect(isAuthenticatedRequest(req)).toBe(true);
    });

    it('getUserFromRequest должен вернуть req.user', () => {
      const user = createValidUserFields();
      const req = { user } as unknown as Request;
      expect(getUserFromRequest(req)).toBe(user);
    });

    it('getUserIdFromRequest должен вернуть user._id', () => {
      const user = createValidUserFields();
      const req = { user } as unknown as Request;
      expect(getUserIdFromRequest(req)).toBe(user._id);
    });
  });
});
