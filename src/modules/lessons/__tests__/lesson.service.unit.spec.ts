import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Types } from 'mongoose';
import type { lessonRepository as LessonRepositoryInstance } from '../lesson.repository';
import type { courseService as CourseServiceInstance } from 'courses/course.service';
import type { fileStorageService as FileStorageServiceInstance } from 'file-storage/file-storage.service';
import type { lessonService as LessonServiceInstance } from '../lesson.service';
import type { Lesson, LessonResource } from '../lesson.types';
import type { Course } from 'courses/course.types';

// Unit-слой: lessonRepository, courseService и fileStorageService замоканы — проверяем
// только бизнес-логику lessonService (владение, ветвление video/resource, порядок
// операций при удалении), не то, что реально происходит в MongoDB/S3. Интеграционные
// тесты (lesson.routes.integration.spec.ts) добивают HTTP-контракт и реальные запросы.
//
// @swc/jest не хойстит jest.mock() выше import — require() после jest.mock() обязателен
// для всего мокаемого/транзитивно ссылающегося на мокаемое (см. Obsidian: Jest/4).
jest.mock('../lesson.repository', () => ({
  lessonRepository: {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByTitleAndCourse: jest.fn(),
    findByCourseId: jest.fn(),
    findByCourseIdWithPagination: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getNextOrderNumber: jest.fn(),
    reorderLessons: jest.fn(),
    updateVideoFile: jest.fn(),
    addResource: jest.fn(),
    removeResourceByIndex: jest.fn(),
  },
}));
jest.mock('courses/course.service', () => ({
  courseService: {
    getById: jest.fn(),
    removeLesson: jest.fn(),
  },
}));
jest.mock('file-storage/file-storage.service', () => ({
  fileStorageService: {
    deleteFile: jest.fn(),
    deleteLessonFolder: jest.fn(),
  },
}));

const { lessonRepository } = require('../lesson.repository') as { lessonRepository: typeof LessonRepositoryInstance };
const { courseService } = require('courses/course.service') as { courseService: typeof CourseServiceInstance };
const { fileStorageService } = require('file-storage/file-storage.service') as {
  fileStorageService: typeof FileStorageServiceInstance;
};
const { lessonService } = require('../lesson.service') as { lessonService: typeof LessonServiceInstance };

const mockLessonRepository = lessonRepository as jest.Mocked<typeof lessonRepository>;
const mockCourseService = courseService as jest.Mocked<typeof courseService>;
const mockFileStorageService = fileStorageService as jest.Mocked<typeof fileStorageService>;

function createMockLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    _id: new Types.ObjectId(),
    title: 'Test Lesson',
    description: 'A test lesson description, long enough.',
    courseId: new Types.ObjectId(),
    order: 1,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Lesson;
}

function createMockCourse(overrides: Partial<Course> = {}): Course {
  return {
    _id: new Types.ObjectId(),
    title: 'Test Course',
    description: 'A test course description, long enough.',
    previewImage: 'https://example.com/preview.png',
    author: new Types.ObjectId(),
    tags: [],
    difficulty: 'beginner',
    lessons: [],
    ratings: [],
    averageRating: 0,
    isPublished: false,
    allowedUsers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Course;
}

describe('LessonService', () => {
  beforeEach(() => {
    // resetAllMocks (не clearAllMocks) — несколько тестов ниже намеренно переопределяют
    // реализацию через mockRejectedValue; clearAllMocks сбрасывает только .calls/.results,
    // но не саму реализацию, и она бы утекала в следующие, никак не связанные тесты.
    jest.resetAllMocks();
  });

  describe('create', () => {
    describe('Когда courseId невалиден', () => {
      it('должен выбросить 400, не обращаясь к репозиторию', async () => {
        await expect(
          lessonService.create({
            title: 'New Lesson',
            description: 'Some long enough description.',
            courseId: 'not-an-object-id',
            order: 1,
            tags: [],
          })
        ).rejects.toMatchObject({ status: 400 });
        expect(mockLessonRepository.create).not.toHaveBeenCalled();
      });
    });

    describe('Когда название урока уже занято в этом курсе', () => {
      it('должен выбросить 409, не создавая урок', async () => {
        const courseId = new Types.ObjectId().toString();
        mockLessonRepository.findByTitleAndCourse.mockResolvedValue(createMockLesson({ title: 'Existing' }));

        await expect(
          lessonService.create({
            title: 'Existing',
            description: 'Some long enough description.',
            courseId,
            order: 1,
            tags: [],
          })
        ).rejects.toMatchObject({ status: 409 });
        expect(mockLessonRepository.create).not.toHaveBeenCalled();
      });
    });

    describe('Когда название свободно', () => {
      it('должен создать урок с courseId как ObjectId и tags по умолчанию', async () => {
        const courseId = new Types.ObjectId().toString();
        mockLessonRepository.findByTitleAndCourse.mockResolvedValue(null);
        mockLessonRepository.create.mockResolvedValue(createMockLesson());

        await lessonService.create({
          title: 'New Lesson',
          description: 'Some long enough description.',
          courseId,
          order: 1,
          tags: undefined as unknown as string[],
        });

        const [createArg] = mockLessonRepository.create.mock.calls[0];
        expect(createArg.title).toBe('New Lesson');
        expect((createArg.courseId as Types.ObjectId).toString()).toBe(courseId);
        expect(createArg.tags).toEqual([]);
      });
    });
  });

  describe('update', () => {
    describe('Когда id урока невалиден', () => {
      it('должен выбросить 400', async () => {
        await expect(lessonService.update('not-valid', { title: 'X' }, new Types.ObjectId())).rejects.toMatchObject({
          status: 400,
        });
      });
    });

    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403, не обновляя урок', async () => {
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: new Types.ObjectId() }));

        await expect(
          lessonService.update(lesson._id.toString(), { title: 'Hacked' }, new Types.ObjectId())
        ).rejects.toMatchObject({ status: 403 });
        expect(mockLessonRepository.update).not.toHaveBeenCalled();
      });
    });

    describe('Когда автор меняет title на уже занятое в том же курсе название', () => {
      it('должен выбросить 409', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson({ title: 'Old Title' });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.findByTitleAndCourse.mockResolvedValue(createMockLesson({ title: 'Taken Title' }));

        await expect(
          lessonService.update(lesson._id.toString(), { title: 'Taken Title' }, authorId)
        ).rejects.toMatchObject({ status: 409 });
      });
    });

    describe('Когда автор меняет только одно поле (не title)', () => {
      it('не должен проверять уникальность названия вообще', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.update.mockResolvedValue(lesson);

        await lessonService.update(lesson._id.toString(), { order: 2 }, authorId);

        expect(mockLessonRepository.findByTitleAndCourse).not.toHaveBeenCalled();
        expect(mockLessonRepository.update).toHaveBeenCalledWith(lesson._id.toString(), { order: 2 });
      });
    });
  });

  describe('delete', () => {
    describe('Когда id урока невалиден', () => {
      it('должен выбросить 400', async () => {
        await expect(lessonService.delete('not-valid', new Types.ObjectId())).rejects.toMatchObject({ status: 400 });
      });
    });

    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403, не удаляя урок и не трогая S3/курс', async () => {
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: new Types.ObjectId() }));

        await expect(lessonService.delete(lesson._id.toString(), new Types.ObjectId())).rejects.toMatchObject({
          status: 403,
        });
        expect(mockFileStorageService.deleteLessonFolder).not.toHaveBeenCalled();
        expect(mockLessonRepository.delete).not.toHaveBeenCalled();
        expect(mockCourseService.removeLesson).not.toHaveBeenCalled();
      });
    });

    describe('Когда вызывающий — автор курса', () => {
      it('должен удалить файлы урока из S3, урок из БД, потом отвязать урок от курса', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson();
        const course = createMockCourse({ _id: lesson.courseId, author: authorId });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(course);
        mockLessonRepository.delete.mockResolvedValue(true);

        await lessonService.delete(lesson._id.toString(), authorId);

        expect(mockFileStorageService.deleteLessonFolder).toHaveBeenCalledWith(lesson._id.toString());
        expect(mockLessonRepository.delete).toHaveBeenCalledWith(lesson._id.toString());
        expect(mockCourseService.removeLesson).toHaveBeenCalledWith(course._id.toString(), lesson._id.toString(), authorId);
      });

      it('должен выбросить 404, если репозиторий сообщил, что удалять было нечего', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.delete.mockResolvedValue(false);

        await expect(lessonService.delete(lesson._id.toString(), authorId)).rejects.toMatchObject({ status: 404 });
        expect(mockCourseService.removeLesson).not.toHaveBeenCalled();
      });

      it('не должен падать, если очистка файлов в S3 завершилась ошибкой', async () => {
        // cleanupLessonFiles ловит ошибку внутри себя (try/catch) — сбой S3 не должен
        // блокировать удаление самой записи урока из БД.
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockFileStorageService.deleteLessonFolder.mockRejectedValue(new Error('S3 недоступен'));
        mockLessonRepository.delete.mockResolvedValue(true);

        await expect(lessonService.delete(lesson._id.toString(), authorId)).resolves.toBeUndefined();
        expect(mockLessonRepository.delete).toHaveBeenCalledWith(lesson._id.toString());
      });
    });
  });

  describe('deleteAllForCourse', () => {
    describe('Когда у курса несколько уроков', () => {
      it('должен удалить файлы и запись каждого урока, не трогая courseService', async () => {
        const courseId = new Types.ObjectId().toString();
        const lessons = [createMockLesson(), createMockLesson()];
        mockLessonRepository.findByCourseId.mockResolvedValue(lessons);
        mockLessonRepository.delete.mockResolvedValue(true);

        await lessonService.deleteAllForCourse(courseId);

        expect(mockFileStorageService.deleteLessonFolder).toHaveBeenCalledTimes(2);
        expect(mockLessonRepository.delete).toHaveBeenCalledTimes(2);
        lessons.forEach(lesson => {
          expect(mockFileStorageService.deleteLessonFolder).toHaveBeenCalledWith(lesson._id.toString());
          expect(mockLessonRepository.delete).toHaveBeenCalledWith(lesson._id.toString());
        });
        expect(mockCourseService.removeLesson).not.toHaveBeenCalled();
        expect(mockCourseService.getById).not.toHaveBeenCalled();
      });
    });

    describe('Когда у курса нет уроков', () => {
      it('не должен обращаться ни к S3, ни к репозиторию удаления', async () => {
        mockLessonRepository.findByCourseId.mockResolvedValue([]);

        await lessonService.deleteAllForCourse(new Types.ObjectId().toString());

        expect(mockFileStorageService.deleteLessonFolder).not.toHaveBeenCalled();
        expect(mockLessonRepository.delete).not.toHaveBeenCalled();
      });
    });
  });

  describe('getById', () => {
    describe('Когда id невалиден', () => {
      it('должен выбросить 400', async () => {
        await expect(lessonService.getById('not-valid')).rejects.toMatchObject({ status: 400 });
      });
    });

    describe('Когда урок не найден', () => {
      it('должен выбросить 404', async () => {
        mockLessonRepository.findById.mockResolvedValue(null);
        await expect(lessonService.getById(new Types.ObjectId().toString())).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('Когда урок найден', () => {
      it('должен вернуть урок как есть', async () => {
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);

        const result = await lessonService.getById(lesson._id.toString());

        expect(result).toBe(lesson);
      });
    });
  });

  describe('getByCourseId', () => {
    describe('Когда courseId невалиден', () => {
      it('должен выбросить 400', async () => {
        await expect(lessonService.getByCourseId('not-valid')).rejects.toMatchObject({ status: 400 });
      });
    });

    describe('Когда courseId валиден', () => {
      it('должен вернуть уроки курса из репозитория', async () => {
        const courseId = new Types.ObjectId().toString();
        mockLessonRepository.findByCourseId.mockResolvedValue([]);

        await lessonService.getByCourseId(courseId);

        expect(mockLessonRepository.findByCourseId).toHaveBeenCalledWith(courseId);
      });
    });
  });

  describe('checkUserAccess', () => {
    describe('Когда lessonId или userId невалидны', () => {
      it('должен вернуть false, не обращаясь к репозиторию', async () => {
        const result = await lessonService.checkUserAccess('not-valid', new Types.ObjectId().toString());
        expect(result).toBe(false);
        expect(mockLessonRepository.findById).not.toHaveBeenCalled();
      });
    });

    describe('Когда урок не найден', () => {
      it('должен вернуть false', async () => {
        mockLessonRepository.findById.mockResolvedValue(null);
        const result = await lessonService.checkUserAccess(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString()
        );
        expect(result).toBe(false);
      });
    });

    describe('Курс не опубликован', () => {
      it('должен вернуть true для автора курса', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ isPublished: false, author: authorId }));

        const result = await lessonService.checkUserAccess(lesson._id.toString(), authorId.toString());

        expect(result).toBe(true);
      });

      it('должен вернуть true для пользователя из allowedUsers', async () => {
        const allowedUserId = new Types.ObjectId();
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(
          createMockCourse({ isPublished: false, allowedUsers: [allowedUserId] })
        );

        const result = await lessonService.checkUserAccess(lesson._id.toString(), allowedUserId.toString());

        expect(result).toBe(true);
      });

      it('должен вернуть false для постороннего пользователя', async () => {
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ isPublished: false }));

        const result = await lessonService.checkUserAccess(
          lesson._id.toString(),
          new Types.ObjectId().toString()
        );

        expect(result).toBe(false);
      });
    });

    describe('Курс опубликован', () => {
      it('должен вернуть true для любого пользователя', async () => {
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ isPublished: true }));

        const result = await lessonService.checkUserAccess(
          lesson._id.toString(),
          new Types.ObjectId().toString()
        );

        expect(result).toBe(true);
      });
    });
  });

  describe('uploadFile — видео', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403, не загружая видео', async () => {
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: new Types.ObjectId() }));

        await expect(
          lessonService.uploadFile(
            lesson._id.toString(),
            { url: 'https://s3/video.mp4', originalName: 'video.mp4', size: 100, mimeType: 'video/mp4' },
            'video',
            undefined,
            undefined,
            new Types.ObjectId()
          )
        ).rejects.toMatchObject({ status: 403 });
        expect(mockLessonRepository.updateVideoFile).not.toHaveBeenCalled();
      });
    });

    describe('Когда userId не передан', () => {
      it('не должен проверять права вообще (проверка привязана к наличию userId)', async () => {
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockLessonRepository.updateVideoFile.mockResolvedValue(lesson);

        await lessonService.uploadFile(
          lesson._id.toString(),
          { url: 'https://s3/video.mp4', originalName: 'video.mp4', size: 100, mimeType: 'video/mp4' },
          'video'
        );

        expect(mockCourseService.getById).not.toHaveBeenCalled();
        expect(mockLessonRepository.updateVideoFile).toHaveBeenCalled();
      });
    });

    describe('Когда у урока ещё нет видео', () => {
      it('должен сохранить новое видео, не вызывая удаление старого файла', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.updateVideoFile.mockResolvedValue(lesson);

        await lessonService.uploadFile(
          lesson._id.toString(),
          { url: 'https://s3/new.mp4', originalName: 'new.mp4', size: 100, mimeType: 'video/mp4' },
          'video',
          undefined,
          undefined,
          authorId
        );

        expect(mockFileStorageService.deleteFile).not.toHaveBeenCalled();
        expect(mockLessonRepository.updateVideoFile).toHaveBeenCalledWith(
          lesson._id.toString(),
          expect.objectContaining({ url: 'https://s3/new.mp4', originalName: 'new.mp4' })
        );
      });
    });

    describe('Когда у урока уже есть видео', () => {
      it('должен удалить старый файл видео из хранилища перед сохранением нового', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson({ videoFile: { url: 'https://s3/old.mp4', originalName: 'old.mp4' } });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.updateVideoFile.mockResolvedValue(lesson);

        await lessonService.uploadFile(
          lesson._id.toString(),
          { url: 'https://s3/new.mp4', originalName: 'new.mp4', size: 100, mimeType: 'video/mp4' },
          'video',
          undefined,
          undefined,
          authorId
        );

        expect(mockFileStorageService.deleteFile).toHaveBeenCalledWith('https://s3/old.mp4');
        expect(mockLessonRepository.updateVideoFile).toHaveBeenCalledWith(
          lesson._id.toString(),
          expect.objectContaining({ url: 'https://s3/new.mp4' })
        );
      });

      it('не должен падать, если удаление старого видео в S3 завершилось ошибкой', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson({ videoFile: { url: 'https://s3/old.mp4', originalName: 'old.mp4' } });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockFileStorageService.deleteFile.mockRejectedValue(new Error('S3 недоступен'));
        mockLessonRepository.updateVideoFile.mockResolvedValue(lesson);

        await expect(
          lessonService.uploadFile(
            lesson._id.toString(),
            { url: 'https://s3/new.mp4', originalName: 'new.mp4', size: 100, mimeType: 'video/mp4' },
            'video',
            undefined,
            undefined,
            authorId
          )
        ).resolves.toBe(lesson);
      });
    });
  });

  describe('uploadFile — ресурс', () => {
    describe('Когда ресурса с таким названием ещё нет', () => {
      it('должен добавить новый ресурс, используя originalName как title по умолчанию', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson({ resources: [] });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.addResource.mockResolvedValue(lesson);

        await lessonService.uploadFile(
          lesson._id.toString(),
          { url: 'https://s3/notes.pdf', originalName: 'notes.pdf', size: 50, mimeType: 'application/pdf' },
          'resource',
          undefined,
          undefined,
          authorId
        );

        expect(mockLessonRepository.addResource).toHaveBeenCalledWith(
          lesson._id.toString(),
          expect.objectContaining({ type: 'file', title: 'notes.pdf', url: 'https://s3/notes.pdf' })
        );
      });
    });

    describe('Когда ресурс с таким названием (тип file) уже существует', () => {
      it('должен заменить ресурс на его месте в массиве и удалить старый файл', async () => {
        const authorId = new Types.ObjectId();
        const oldResource: LessonResource = { type: 'file', title: 'notes.pdf', url: 'https://s3/old-notes.pdf' };
        const lesson = createMockLesson({ resources: [oldResource] });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.update.mockResolvedValue(lesson);

        await lessonService.uploadFile(
          lesson._id.toString(),
          { url: 'https://s3/new-notes.pdf', originalName: 'notes.pdf', size: 60, mimeType: 'application/pdf' },
          'resource',
          'notes.pdf',
          undefined,
          authorId
        );

        expect(mockFileStorageService.deleteFile).toHaveBeenCalledWith('https://s3/old-notes.pdf');
        expect(mockLessonRepository.update).toHaveBeenCalledWith(lesson._id.toString(), {
          resources: [expect.objectContaining({ url: 'https://s3/new-notes.pdf', title: 'notes.pdf' })],
        });
      });
    });

    describe('Когда ресурс с таким названием существует, но типа link (не file)', () => {
      it('должен добавить новый ресурс отдельно, не заменяя существующий', async () => {
        const authorId = new Types.ObjectId();
        const linkResource: LessonResource = { type: 'link', title: 'notes.pdf', url: 'https://example.com' };
        const lesson = createMockLesson({ resources: [linkResource] });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.addResource.mockResolvedValue(lesson);

        await lessonService.uploadFile(
          lesson._id.toString(),
          { url: 'https://s3/notes.pdf', originalName: 'notes.pdf', size: 50, mimeType: 'application/pdf' },
          'resource',
          'notes.pdf',
          undefined,
          authorId
        );

        expect(mockLessonRepository.addResource).toHaveBeenCalled();
        expect(mockLessonRepository.update).not.toHaveBeenCalled();
      });
    });
  });

  describe('deleteFile', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403, не удаляя файл из хранилища', async () => {
        const lesson = createMockLesson();
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: new Types.ObjectId() }));

        await expect(
          lessonService.deleteFile(lesson._id.toString(), 'https://s3/video.mp4', 'video', new Types.ObjectId())
        ).rejects.toMatchObject({ status: 403 });
        expect(mockFileStorageService.deleteFile).not.toHaveBeenCalled();
      });
    });

    describe('Когда fileType — video', () => {
      it('должен удалить файл из хранилища и снять videoFile через $unset (undefined)', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson({ videoFile: { url: 'https://s3/video.mp4' } });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.updateVideoFile.mockResolvedValue(createMockLesson());

        await lessonService.deleteFile(lesson._id.toString(), 'https://s3/video.mp4', 'video', authorId);

        expect(mockFileStorageService.deleteFile).toHaveBeenCalledWith('https://s3/video.mp4');
        expect(mockLessonRepository.updateVideoFile).toHaveBeenCalledWith(lesson._id.toString(), undefined);
      });
    });

    describe('Когда fileType — resource', () => {
      it('должен выбросить 404, если ресурс с таким URL не найден', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson({ resources: [] });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));

        await expect(
          lessonService.deleteFile(lesson._id.toString(), 'https://s3/missing.pdf', 'resource', authorId)
        ).rejects.toMatchObject({ status: 404 });
        expect(mockLessonRepository.removeResourceByIndex).not.toHaveBeenCalled();
      });

      it('должен найти ресурс по URL и удалить его по индексу', async () => {
        const authorId = new Types.ObjectId();
        const resource: LessonResource = { type: 'file', title: 'notes.pdf', url: 'https://s3/notes.pdf' };
        const lesson = createMockLesson({ resources: [resource] });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.removeResourceByIndex.mockResolvedValue(createMockLesson());

        await lessonService.deleteFile(lesson._id.toString(), 'https://s3/notes.pdf', 'resource', authorId);

        expect(mockLessonRepository.removeResourceByIndex).toHaveBeenCalledWith(lesson._id.toString(), 0);
      });
    });
  });

  describe('deleteResourceByIndex', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403', async () => {
        const lesson = createMockLesson({ resources: [{ type: 'link', title: 'x', url: 'https://x' }] });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: new Types.ObjectId() }));

        await expect(
          lessonService.deleteResourceByIndex(lesson._id.toString(), 0, new Types.ObjectId())
        ).rejects.toMatchObject({ status: 403 });
      });
    });

    describe('Когда индекс ресурса вне диапазона', () => {
      it('должен выбросить 404, не удаляя ничего из хранилища', async () => {
        const authorId = new Types.ObjectId();
        const lesson = createMockLesson({ resources: [] });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));

        await expect(lessonService.deleteResourceByIndex(lesson._id.toString(), 0, authorId)).rejects.toMatchObject({
          status: 404,
        });
        expect(mockFileStorageService.deleteFile).not.toHaveBeenCalled();
        expect(mockLessonRepository.removeResourceByIndex).not.toHaveBeenCalled();
      });
    });

    describe('Когда ресурс типа file с URL', () => {
      it('должен удалить файл из хранилища, затем ресурс из БД', async () => {
        const authorId = new Types.ObjectId();
        const resource: LessonResource = { type: 'file', title: 'notes.pdf', url: 'https://s3/notes.pdf' };
        const lesson = createMockLesson({ resources: [resource] });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.removeResourceByIndex.mockResolvedValue(createMockLesson());

        await lessonService.deleteResourceByIndex(lesson._id.toString(), 0, authorId);

        expect(mockFileStorageService.deleteFile).toHaveBeenCalledWith('https://s3/notes.pdf');
        expect(mockLessonRepository.removeResourceByIndex).toHaveBeenCalledWith(lesson._id.toString(), 0);
      });

      it('не должен падать, если удаление файла из хранилища завершилось ошибкой', async () => {
        const authorId = new Types.ObjectId();
        const resource: LessonResource = { type: 'file', title: 'notes.pdf', url: 'https://s3/notes.pdf' };
        const lesson = createMockLesson({ resources: [resource] });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockFileStorageService.deleteFile.mockRejectedValue(new Error('S3 недоступен'));
        mockLessonRepository.removeResourceByIndex.mockResolvedValue(createMockLesson());

        await expect(lessonService.deleteResourceByIndex(lesson._id.toString(), 0, authorId)).resolves.toBeDefined();
        expect(mockLessonRepository.removeResourceByIndex).toHaveBeenCalledWith(lesson._id.toString(), 0);
      });
    });

    describe('Когда ресурс типа link (без файла)', () => {
      it('не должен обращаться к хранилищу файлов вообще', async () => {
        const authorId = new Types.ObjectId();
        const resource: LessonResource = { type: 'link', title: 'external', url: 'https://example.com' };
        const lesson = createMockLesson({ resources: [resource] });
        mockLessonRepository.findById.mockResolvedValue(lesson);
        mockCourseService.getById.mockResolvedValue(createMockCourse({ author: authorId }));
        mockLessonRepository.removeResourceByIndex.mockResolvedValue(createMockLesson());

        await lessonService.deleteResourceByIndex(lesson._id.toString(), 0, authorId);

        expect(mockFileStorageService.deleteFile).not.toHaveBeenCalled();
      });
    });
  });
});
