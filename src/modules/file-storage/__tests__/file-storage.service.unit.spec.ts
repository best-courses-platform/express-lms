import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { FileStorageService as FileStorageServiceClass } from '../file-storage.service';
import type { MulterS3File } from '../file-storage.types';

// Unit-слой: реальный @aws-sdk/client-s3 замокан (S3Client.send), config/isSelectelConfigured/
// getSelectelPublicUrl тоже — проверяем только логику FileStorageService (mock-режим vs
// реальный S3, сборку ключа, ACL, batching при удалении папки, нормализацию ошибок), не
// настоящую сеть. Интеграционные тесты lessons (см. lesson.routes.integration.spec.ts) это
// же покрывают только в mock-режиме (SELECTEL_* пустые в test/setupTestEnv.ts) — здесь же
// впервые проверяется ветка "Selectel реально настроен".
//
// isSelectelConfigured() — обычная функция, вызываемая заново в конструкторе и в каждом
// методе (не значение, зафиксированное один раз при импорте модуля, как isTestEnv в
// rate-limit.ts) — поэтому здесь не нужен jest.resetModules(): управляем возвращаемым
// значением мока per-test и создаём новый экземпляр FileStorageService в каждом тесте.
type S3CommandInput = Record<string, unknown>;

const mockSend = jest.fn<(command: unknown) => Promise<unknown>>();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn((input: S3CommandInput) => ({ __command: 'PutObjectCommand', ...input })),
  DeleteObjectCommand: jest.fn((input: S3CommandInput) => ({ __command: 'DeleteObjectCommand', ...input })),
  DeleteObjectsCommand: jest.fn((input: S3CommandInput) => ({ __command: 'DeleteObjectsCommand', ...input })),
  ListObjectsV2Command: jest.fn((input: S3CommandInput) => ({ __command: 'ListObjectsV2Command', ...input })),
}));

jest.mock('../../../config', () => ({
  config: {
    selectel: {
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
      region: 'ru-1',
      endpoint: 'https://s3.selcdn.ru',
      bucketName: 'test-bucket',
      publicUrl: 'https://test-bucket.selcdn.ru',
    },
  },
  isSelectelConfigured: jest.fn<() => boolean>(),
  getSelectelPublicUrl: jest.fn<(key: string) => string>((key: string) => `https://test-bucket.selcdn.ru/${key}`),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { FileStorageService } = require('../file-storage.service') as { FileStorageService: typeof FileStorageServiceClass };
const { isSelectelConfigured, getSelectelPublicUrl } = require('../../../config') as {
  isSelectelConfigured: jest.Mock<() => boolean>;
  getSelectelPublicUrl: jest.Mock<(key: string) => string>;
};
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3') as Record<string, jest.Mock<(input: S3CommandInput) => S3CommandInput>>;
/* eslint-enable @typescript-eslint/no-var-requires */

function createConfiguredService(): FileStorageServiceClass {
  isSelectelConfigured.mockReturnValue(true);
  return new FileStorageService();
}

function createMockService(): FileStorageServiceClass {
  isSelectelConfigured.mockReturnValue(false);
  return new FileStorageService();
}

describe('FileStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSelectelPublicUrl.mockImplementation((key: string) => `https://test-bucket.selcdn.ru/${key}`);
  });

  describe('uploadFile', () => {
    describe('Когда Selectel не настроен (mock-режим)', () => {
      it('должен вернуть mock://-ссылку и не создавать S3-клиент вообще', async () => {
        // Given
        const service = createMockService();

        // When
        const result = await service.uploadFile(Buffer.from('hello'), {
          folder: 'lessons/l1/video',
          filename: 'clip.mp4',
          contentType: 'video/mp4',
        });

        // Then
        expect(result.url).toBe('mock://lessons/l1/video/clip.mp4');
        expect(result.size).toBe(5);
        expect(result.mimeType).toBe('video/mp4');
        expect(S3Client).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
      });

      it('должен сгенерировать имя файла по умолчанию, если filename не передан', async () => {
        const service = createMockService();

        const result = await service.uploadFile(Buffer.from('x'), {
          folder: 'lessons/l1/resource',
          contentType: 'text/plain',
        });

        expect(result.url).toMatch(/^mock:\/\/lessons\/l1\/resource\/file-\d+$/);
      });
    });

    describe('Когда Selectel настроен', () => {
      it('должен загрузить файл с ACL: public-read (регрессия — без него файл недоступен по публичной ссылке)', async () => {
        // Given — см. комментарий в file-storage.service.ts: без явного ACL объект
        // наследует приватный ACL бакета, а getSelectelPublicUrl всё равно строит "публичную"
        // ссылку — она отдаёт 403 всем, кто по ней перейдёт.
        mockSend.mockResolvedValue({});
        const service = createConfiguredService();

        // When
        await service.uploadFile(Buffer.from('hello'), {
          folder: 'lessons/l1/video',
          filename: 'clip.mp4',
          contentType: 'video/mp4',
        });

        // Then
        expect(PutObjectCommand).toHaveBeenCalledWith(expect.objectContaining({ ACL: 'public-read' }));
      });

      it('должен вернуть URL из getSelectelPublicUrl(key), не составлять его вручную', async () => {
        mockSend.mockResolvedValue({});
        const service = createConfiguredService();

        const result = await service.uploadFile(Buffer.from('hello'), {
          folder: 'lessons/l1/video',
          filename: 'clip.mp4',
          contentType: 'video/mp4',
        });

        expect(getSelectelPublicUrl).toHaveBeenCalledWith(expect.stringContaining('lessons/l1/video/'));
        expect(result.url).toBe(getSelectelPublicUrl.mock.results[0].value);
      });

      it('должен санитизировать небезопасные символы в имени файла при сборке ключа', async () => {
        mockSend.mockResolvedValue({});
        const service = createConfiguredService();

        await service.uploadFile(Buffer.from('x'), {
          folder: 'lessons/l1/resource',
          filename: 'мой файл (1).pdf',
          contentType: 'application/pdf',
        });

        const [callInput] = PutObjectCommand.mock.calls[0];
        expect(callInput.Key).not.toMatch(/[()\s]/);
        expect((callInput.Key as string).endsWith('.pdf')).toBe(true);
      });

      it('должен обернуть ошибку S3 в AppError(500) с контекстом (filename/folder/key)', async () => {
        // Given
        mockSend.mockRejectedValue(new Error('S3 timeout'));
        const service = createConfiguredService();

        // When & Then
        await expect(
          service.uploadFile(Buffer.from('x'), {
            folder: 'lessons/l1/video',
            filename: 'clip.mp4',
            contentType: 'video/mp4',
          })
        ).rejects.toMatchObject({
          status: 500,
          details: expect.objectContaining({ filename: 'clip.mp4', folder: 'lessons/l1/video' }),
        });
      });
    });
  });

  describe('deleteFile', () => {
    describe('Когда Selectel не настроен', () => {
      it('должен тихо завершиться без обращения к S3', async () => {
        const service = createMockService();

        await expect(service.deleteFile('https://test-bucket.selcdn.ru/lessons/l1/video/x.mp4')).resolves.toBeUndefined();
        expect(mockSend).not.toHaveBeenCalled();
      });
    });

    describe('Когда Selectel настроен, но URL — mock://', () => {
      it('должен пропустить удаление (mock-файлы никогда не попадали в реальный S3)', async () => {
        const service = createConfiguredService();

        await service.deleteFile('mock://lessons/l1/video/x.mp4');

        expect(mockSend).not.toHaveBeenCalled();
      });
    });

    describe('Когда Selectel настроен и передан пустой fileUrl', () => {
      it('должен тихо завершиться, не бросая ошибку', async () => {
        const service = createConfiguredService();

        await expect(service.deleteFile('')).resolves.toBeUndefined();
        expect(mockSend).not.toHaveBeenCalled();
      });
    });

    describe('Когда Selectel настроен и передан полный https:// URL', () => {
      it('должен вычислить ключ из пути URL и удалить именно его', async () => {
        // Given
        mockSend.mockResolvedValue({});
        const service = createConfiguredService();

        // When
        await service.deleteFile('https://test-bucket.selcdn.ru/lessons/l1/video/x.mp4');

        // Then
        expect(DeleteObjectCommand).toHaveBeenCalledWith(
          expect.objectContaining({ Bucket: 'test-bucket', Key: 'lessons/l1/video/x.mp4' })
        );
      });

      it('должен убрать префикс с именем бакета из ключа, если он есть в пути', async () => {
        mockSend.mockResolvedValue({});
        const service = createConfiguredService();

        await service.deleteFile('https://test-bucket.selcdn.ru/test-bucket/lessons/l1/x.mp4');

        expect(DeleteObjectCommand).toHaveBeenCalledWith(
          expect.objectContaining({ Key: 'lessons/l1/x.mp4' })
        );
      });
    });

    describe('Когда передан голый ключ (не https://)', () => {
      it('должен использовать его как есть в качестве Key', async () => {
        mockSend.mockResolvedValue({});
        const service = createConfiguredService();

        await service.deleteFile('lessons/l1/video/x.mp4');

        expect(DeleteObjectCommand).toHaveBeenCalledWith(expect.objectContaining({ Key: 'lessons/l1/video/x.mp4' }));
      });
    });

    describe('Когда S3 бросает ошибку при удалении', () => {
      it('должен обернуть в AppError(500) с исходным fileUrl в details', async () => {
        mockSend.mockRejectedValue(new Error('access denied'));
        const service = createConfiguredService();

        await expect(service.deleteFile('lessons/l1/x.mp4')).rejects.toMatchObject({
          status: 500,
          details: expect.objectContaining({ fileUrl: 'lessons/l1/x.mp4', originalError: 'access denied' }),
        });
      });

      it('должен нормализовать не-Error исключение (строку) в details.originalError', async () => {
        // Given — регрессия на normalizeError: SDK/сеть теоретически может бросить не
        // экземпляр Error (например, строку) — сервис не должен упасть с TypeError на
        // доступе к несуществующему .message.
        mockSend.mockRejectedValue('boom');
        const service = createConfiguredService();

        await expect(service.deleteFile('lessons/l1/x.mp4')).rejects.toMatchObject({
          status: 500,
          details: expect.objectContaining({ originalError: 'boom' }),
        });
      });
    });
  });

  describe('deleteLessonFolder', () => {
    describe('Когда Selectel не настроен', () => {
      it('должен тихо завершиться без обращения к S3', async () => {
        const service = createMockService();

        await expect(service.deleteLessonFolder('lesson-1')).resolves.toBeUndefined();
        expect(mockSend).not.toHaveBeenCalled();
      });
    });

    describe('Когда папка пуста (ListObjectsV2 не вернул Contents)', () => {
      it('не должен вызывать DeleteObjectsCommand вообще', async () => {
        mockSend.mockResolvedValue({ Contents: [] });
        const service = createConfiguredService();

        await service.deleteLessonFolder('lesson-1');

        expect(DeleteObjectsCommand).not.toHaveBeenCalled();
      });
    });

    describe('Когда в папке есть файлы', () => {
      it('должен запросить список с правильным Prefix и удалить ровно эти ключи', async () => {
        // Given
        mockSend.mockImplementation((command: unknown) => {
          if ((command as { __command: string }).__command === 'ListObjectsV2Command') {
            return Promise.resolve({ Contents: [{ Key: 'lessons/lesson-1/video/a.mp4' }, { Key: 'lessons/lesson-1/resource/b.pdf' }] });
          }
          return Promise.resolve({});
        });
        const service = createConfiguredService();

        // When
        await service.deleteLessonFolder('lesson-1');

        // Then
        expect(ListObjectsV2Command).toHaveBeenCalledWith(
          expect.objectContaining({ Bucket: 'test-bucket', Prefix: 'lessons/lesson-1/' })
        );
        expect(DeleteObjectsCommand).toHaveBeenCalledWith(
          expect.objectContaining({
            Bucket: 'test-bucket',
            Delete: { Objects: [{ Key: 'lessons/lesson-1/video/a.mp4' }, { Key: 'lessons/lesson-1/resource/b.pdf' }] },
          })
        );
      });
    });

    describe('Когда в папке больше 1000 файлов', () => {
      it('должен разбить удаление на batch-запросы по 1000 ключей (регрессия — лимит DeleteObjectsCommand)', async () => {
        // Given
        const keys = Array.from({ length: 1500 }, (_, i) => ({ Key: `lessons/lesson-1/resource/f${i}.pdf` }));
        mockSend.mockImplementation((command: unknown) => {
          if ((command as { __command: string }).__command === 'ListObjectsV2Command') {
            return Promise.resolve({ Contents: keys });
          }
          return Promise.resolve({});
        });
        const service = createConfiguredService();

        // When
        await service.deleteLessonFolder('lesson-1');

        // Then — 1500 ключей => 2 батча (1000 + 500), не 1500 отдельных запросов
        expect(DeleteObjectsCommand).toHaveBeenCalledTimes(2);
        const firstBatch = (DeleteObjectsCommand.mock.calls[0][0] as { Delete: { Objects: unknown[] } }).Delete.Objects;
        const secondBatch = (DeleteObjectsCommand.mock.calls[1][0] as { Delete: { Objects: unknown[] } }).Delete.Objects;
        expect(firstBatch).toHaveLength(1000);
        expect(secondBatch).toHaveLength(500);
      });
    });

    describe('Когда S3 бросает ошибку', () => {
      it('должен обернуть в AppError(500) с lessonId/folder в details', async () => {
        mockSend.mockRejectedValue(new Error('list failed'));
        const service = createConfiguredService();

        await expect(service.deleteLessonFolder('lesson-1')).rejects.toMatchObject({
          status: 500,
          details: expect.objectContaining({ lessonId: 'lesson-1', folder: 'lessons/lesson-1/' }),
        });
      });
    });
  });

  describe('uploadMulterFile', () => {
    function createMulterFile(overrides: Partial<MulterS3File> = {}): MulterS3File {
      return {
        fieldname: 'file',
        originalname: 'clip.mp4',
        encoding: '7bit',
        mimetype: 'video/mp4',
        size: 123,
        ...overrides,
      } as MulterS3File;
    }

    describe('Когда файл уже загружен через multer-s3 (есть key)', () => {
      it('должен вернуть URL из getSelectelPublicUrl(key), не пытаясь загрузить заново', async () => {
        // Given — намеренно НЕ используем multerFile.location (см. комментарий в самом
        // сервисе про регрессию с недоступной по анонимному GET ссылкой).
        const service = createConfiguredService();
        const multerFile = createMulterFile({ key: 'lessons/l1/video/clip.mp4', location: 'https://s3-internal.example/clip.mp4' });

        // When
        const result = await service.uploadMulterFile(multerFile, 'l1');

        // Then
        expect(getSelectelPublicUrl).toHaveBeenCalledWith('lessons/l1/video/clip.mp4');
        expect(result.url).not.toContain('s3-internal');
        expect(mockSend).not.toHaveBeenCalled();
      });
    });

    describe('Когда файл в памяти (memoryStorage, есть buffer, нет key)', () => {
      it('должен загрузить через uploadLessonFile/uploadFile', async () => {
        mockSend.mockResolvedValue({});
        const service = createConfiguredService();
        const multerFile = createMulterFile({ buffer: Buffer.from('video-bytes') });

        const result = await service.uploadMulterFile(multerFile, 'l1');

        expect(PutObjectCommand).toHaveBeenCalledWith(expect.objectContaining({ ContentType: 'video/mp4' }));
        expect(result.size).toBe(11);
      });
    });

    describe('Когда нет ни key, ни buffer', () => {
      it('должен выбросить AppError(400) — неподдерживаемый формат', async () => {
        const service = createConfiguredService();
        const multerFile = createMulterFile();

        await expect(service.uploadMulterFile(multerFile, 'l1')).rejects.toMatchObject({ status: 400 });
      });
    });
  });
});
