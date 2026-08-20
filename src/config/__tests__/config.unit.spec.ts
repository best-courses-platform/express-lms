import { describe, it, expect, jest } from '@jest/globals';
import type * as ConfigModule from '../index';

// Unit-слой на чистые вспомогательные функции config/index.ts (isSelectelConfigured/
// getSelectelPublicUrl/logConfigValidation) — раньше не тестировались вообще: в
// file-storage.service.unit.spec.ts они замокан целиком, а в остальных тестах
// SELECTEL_ACCESS_KEY_ID/SELECTEL_SECRET_ACCESS_KEY всегда пусты (см. test/setupTestEnv.ts),
// то есть настоящая реализация ни разу не выполнялась.
//
// `config` — модульный синглтон, вычисляемый один раз при импорте через
// `configSchema.parse(process.env...)` — единственный способ проверить разные комбинации
// SELECTEL_*, не трогая процесс целиком: тот же приём, что и в middleware/rate-limit.ts —
// jest.resetModules() + require() с временно переопределённым process.env, откат в finally.
//
// dotenv.config() внутри config/index.ts не перезаписывает УЖЕ выставленную переменную —
// но при удалении переменной через delete (нужно для проверки "не настроен" на publicUrl,
// где z.string().url().optional() не пропустит пустую строку) она снова читается из
// РЕАЛЬНОГО .env разработчика при resetModules-перезагрузке модуля. На этой машине там
// оказались настоящие Selectel-креды — без мока dotenv тест "publicUrl не настроен" был бы
// недетерминированным (зависел бы от чужого .env), а "accessKeyId/secretAccessKey не заданы"
// вообще ложно проходил бы с реальными кредами вместо ожидаемого false. Мокаем dotenv.config()
// как no-op — тот же класс защиты, что и намеренное обнуление EMAIL_USER/SELECTEL_* в
// test/setupTestEnv.ts, только на уровне этого файла, а не всего процесса.
jest.mock('dotenv', () => ({ config: jest.fn() }));
function loadConfigModule(envOverrides: Record<string, string | undefined>): typeof ConfigModule {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(envOverrides)) {
    previous[key] = process.env[key];
    const value = envOverrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  jest.resetModules();
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../index') as typeof ConfigModule;
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

const FULL_SELECTEL_ENV = {
  SELECTEL_ACCESS_KEY_ID: 'test-access-key',
  SELECTEL_SECRET_ACCESS_KEY: 'test-secret-key',
  SELECTEL_BUCKET_NAME: 'test-bucket',
  SELECTEL_PUBLIC_URL: 'https://test-bucket.selstorage.ru',
};

describe('isSelectelConfigured', () => {
  describe('Когда SELECTEL_* пусты (как в test-окружении по умолчанию)', () => {
    it('должен вернуть false', () => {
      const { isSelectelConfigured } = loadConfigModule({});
      expect(isSelectelConfigured()).toBe(false);
    });
  });

  describe('Когда все 4 обязательных поля заданы', () => {
    it('должен вернуть true', () => {
      const { isSelectelConfigured } = loadConfigModule(FULL_SELECTEL_ENV);
      expect(isSelectelConfigured()).toBe(true);
    });
  });

  describe('Когда не задан accessKeyId (остальные три — заданы)', () => {
    it('должен вернуть false', () => {
      const { isSelectelConfigured } = loadConfigModule({ ...FULL_SELECTEL_ENV, SELECTEL_ACCESS_KEY_ID: undefined });
      expect(isSelectelConfigured()).toBe(false);
    });
  });

  describe('Когда не задан secretAccessKey (остальные три — заданы)', () => {
    it('должен вернуть false', () => {
      const { isSelectelConfigured } = loadConfigModule({ ...FULL_SELECTEL_ENV, SELECTEL_SECRET_ACCESS_KEY: undefined });
      expect(isSelectelConfigured()).toBe(false);
    });
  });

  describe('Когда не задан publicUrl (остальные три — заданы)', () => {
    it('должен вернуть false — регрессия: без publicUrl загрузка "успешна", но ссылка нерабочая', () => {
      // Given — см. комментарий в самом config/index.ts: без этой проверки загрузка в S3
      // отработала бы "успешно", но вернула клиенту ссылку, по которой ничего не открывается.
      const { isSelectelConfigured } = loadConfigModule({ ...FULL_SELECTEL_ENV, SELECTEL_PUBLIC_URL: undefined });
      expect(isSelectelConfigured()).toBe(false);
    });
  });
});

describe('getSelectelPublicUrl', () => {
  describe('Когда publicUrl настроен', () => {
    it('должен построить URL как publicUrl + "/" + key', () => {
      const { getSelectelPublicUrl } = loadConfigModule(FULL_SELECTEL_ENV);
      expect(getSelectelPublicUrl('lessons/l1/video.mp4')).toBe(
        'https://test-bucket.selstorage.ru/lessons/l1/video.mp4'
      );
    });

    it('должен убрать один ведущий слэш у key, не задваивая его в итоговом URL', () => {
      const { getSelectelPublicUrl } = loadConfigModule(FULL_SELECTEL_ENV);
      expect(getSelectelPublicUrl('/lessons/l1/video.mp4')).toBe(
        'https://test-bucket.selstorage.ru/lessons/l1/video.mp4'
      );
    });
  });

  describe('Когда publicUrl не настроен', () => {
    it('должен выбросить понятную ошибку, а не вернуть ссылку с "undefined" внутри', () => {
      const { getSelectelPublicUrl } = loadConfigModule({ ...FULL_SELECTEL_ENV, SELECTEL_PUBLIC_URL: undefined });
      expect(() => getSelectelPublicUrl('lessons/l1/video.mp4')).toThrow('SELECTEL_PUBLIC_URL');
    });
  });
});

describe('logConfigValidation', () => {
  describe('Когда Selectel не настроен', () => {
    it('должен предупредить в консоль', () => {
      const { logConfigValidation } = loadConfigModule({});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

      logConfigValidation();

      expect(warnSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('Когда Selectel настроен', () => {
    it('не должен предупреждать', () => {
      const { logConfigValidation } = loadConfigModule(FULL_SELECTEL_ENV);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

      logConfigValidation();

      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
      logSpy.mockRestore();
    });
  });
});
