import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Types } from 'mongoose';
import type { courseRepository as CourseRepositoryInstance } from '../course.repository';
import type { lessonService as LessonServiceInstance } from 'lessons/lesson.service';
import type { courseService as CourseServiceInstance } from '../course.service';
import type { Course } from '../course.types';

// Unit-слой: courseRepository и lessonService замоканы — проверяем только бизнес-логику
// courseService (владение, доступ, ветвление), не то, что реально происходит в MongoDB.
// Интеграционные тесты (course.routes.integration.spec.ts) добивают то, что этот слой
// принципиально не видит — сериализацию, реальные Mongoose-запросы, HTTP-контракт.
//
// @swc/jest не хойстит jest.mock() выше import — require() после jest.mock() обязателен
// для всего мокаемого/транзитивно ссылающегося на мокаемое (см. Obsidian: Jest/4).
jest.mock('../course.repository', () => ({
  courseRepository: {
    findByTitle: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    findPublished: jest.fn(),
    findByAuthor: jest.fn(),
    findByAllowedUser: jest.fn(),
    findByDifficulty: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addLesson: jest.fn(),
    removeLesson: jest.fn(),
    addUserToAllowed: jest.fn(),
    removeUserFromAllowed: jest.fn(),
    addRating: jest.fn(),
  },
}));
jest.mock('lessons/lesson.service', () => ({
  lessonService: {
    deleteAllForCourse: jest.fn(),
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { courseRepository } = require('../course.repository') as { courseRepository: typeof CourseRepositoryInstance };
const { lessonService } = require('lessons/lesson.service') as { lessonService: typeof LessonServiceInstance };
const { courseService } = require('../course.service') as { courseService: typeof CourseServiceInstance };
/* eslint-enable @typescript-eslint/no-var-requires */

const mockCourseRepository = courseRepository as jest.Mocked<typeof courseRepository>;
const mockLessonService = lessonService as jest.Mocked<typeof lessonService>;

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

describe('CourseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    describe('Когда название свободно', () => {
      it('должен создать курс с author из параметра, не из тела запроса', async () => {
        // Given
        const authorId = new Types.ObjectId();
        mockCourseRepository.findByTitle.mockResolvedValue(null);
        mockCourseRepository.create.mockResolvedValue(createMockCourse({ author: authorId }));

        // When
        await courseService.create(
          {
            title: 'New Course',
            description: 'Some long enough description here.',
            previewImage: 'https://example.com/img.png',
            tags: [],
            difficulty: 'beginner',
            isPublished: false,
          },
          authorId
        );

        // Then
        expect(mockCourseRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({ author: authorId, title: 'New Course' })
        );
      });
    });

    describe('Когда название уже занято', () => {
      it('должен выбросить 409, не создавая курс', async () => {
        // Given
        mockCourseRepository.findByTitle.mockResolvedValue(createMockCourse({ title: 'Existing' }));

        // When & Then
        await expect(
          courseService.create(
            {
              title: 'Existing',
              description: 'Some long enough description here.',
              previewImage: 'https://example.com/img.png',
              tags: [],
              difficulty: 'beginner',
              isPublished: false,
            },
            new Types.ObjectId()
          )
        ).rejects.toMatchObject({ status: 409 });
        expect(mockCourseRepository.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('update', () => {
    describe('Когда курс не найден', () => {
      it('должен выбросить 404', async () => {
        // Given
        mockCourseRepository.findById.mockResolvedValue(null);

        // When & Then
        await expect(
          courseService.update('507f1f77bcf86cd799439011', { title: 'X' }, new Types.ObjectId())
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403, не обновляя курс', async () => {
        // Given
        const course = createMockCourse({ author: new Types.ObjectId() });
        mockCourseRepository.findById.mockResolvedValue(course);

        // When & Then
        await expect(
          courseService.update(course._id.toString(), { title: 'Hacked' }, new Types.ObjectId())
        ).rejects.toMatchObject({ status: 403 });
        expect(mockCourseRepository.update).not.toHaveBeenCalled();
      });
    });

    describe('Когда автор меняет title на уже занятое другим курсом название', () => {
      it('должен выбросить 409', async () => {
        // Given
        const authorId = new Types.ObjectId();
        const course = createMockCourse({ author: authorId, title: 'Old Title' });
        mockCourseRepository.findById.mockResolvedValue(course);
        mockCourseRepository.findByTitle.mockResolvedValue(createMockCourse({ title: 'Taken Title' }));

        // When & Then
        await expect(
          courseService.update(course._id.toString(), { title: 'Taken Title' }, authorId)
        ).rejects.toMatchObject({ status: 409 });
      });
    });

    describe('Когда автор меняет только одно поле (не title)', () => {
      it('не должен проверять уникальность названия вообще', async () => {
        // Given
        const authorId = new Types.ObjectId();
        const course = createMockCourse({ author: authorId, title: 'Same Title' });
        mockCourseRepository.findById.mockResolvedValue(course);
        mockCourseRepository.update.mockResolvedValue(course);

        // When
        await courseService.update(course._id.toString(), { isPublished: true }, authorId);

        // Then
        expect(mockCourseRepository.findByTitle).not.toHaveBeenCalled();
        expect(mockCourseRepository.update).toHaveBeenCalledWith(course._id.toString(), { isPublished: true });
      });
    });
  });

  describe('canAccess', () => {
    describe('Курс опубликован', () => {
      it('должен вернуть true для анонимного пользователя (userId не передан)', () => {
        const course = createMockCourse({ isPublished: true });
        expect(courseService.canAccess(course, undefined)).toBe(true);
      });
    });

    describe('Курс не опубликован', () => {
      it('должен вернуть false для анонимного пользователя', () => {
        const course = createMockCourse({ isPublished: false });
        expect(courseService.canAccess(course, undefined)).toBe(false);
      });

      it('должен вернуть true для автора курса', () => {
        const authorId = new Types.ObjectId();
        const course = createMockCourse({ isPublished: false, author: authorId });
        expect(courseService.canAccess(course, authorId)).toBe(true);
      });

      it('должен вернуть true для пользователя из allowedUsers', () => {
        const allowedUserId = new Types.ObjectId();
        const course = createMockCourse({ isPublished: false, allowedUsers: [allowedUserId] });
        expect(courseService.canAccess(course, allowedUserId)).toBe(true);
      });

      it('должен вернуть false для постороннего верифицированного пользователя', () => {
        const course = createMockCourse({ isPublished: false });
        expect(courseService.canAccess(course, new Types.ObjectId())).toBe(false);
      });
    });
  });

  describe('delete', () => {
    describe('Когда курс не найден', () => {
      it('должен выбросить 404, не трогая lessonService', async () => {
        // Given
        mockCourseRepository.findById.mockResolvedValue(null);

        // When & Then
        await expect(courseService.delete('507f1f77bcf86cd799439011', new Types.ObjectId())).rejects.toMatchObject({
          status: 404,
        });
        expect(mockLessonService.deleteAllForCourse).not.toHaveBeenCalled();
      });
    });

    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403, не удаляя ни курс, ни уроки', async () => {
        // Given
        const course = createMockCourse({ author: new Types.ObjectId() });
        mockCourseRepository.findById.mockResolvedValue(course);

        // When & Then
        await expect(courseService.delete(course._id.toString(), new Types.ObjectId())).rejects.toMatchObject({
          status: 403,
        });
        expect(mockLessonService.deleteAllForCourse).not.toHaveBeenCalled();
        expect(mockCourseRepository.delete).not.toHaveBeenCalled();
      });
    });

    describe('Когда вызывающий — автор курса', () => {
      it('должен сначала удалить уроки курса, потом сам курс — именно в этом порядке', async () => {
        // Given — регрессионный тест на баг №16 (Рефакторинг проблем): courseService.delete()
        // раньше не чистил уроки курса вообще, оставляя "сирот" в БД и файлы в S3 навсегда.
        const authorId = new Types.ObjectId();
        const course = createMockCourse({ author: authorId });
        mockCourseRepository.findById.mockResolvedValue(course);
        mockCourseRepository.delete.mockResolvedValue(true);

        const callOrder: string[] = [];
        mockLessonService.deleteAllForCourse.mockImplementation(async () => {
          callOrder.push('deleteAllForCourse');
        });
        mockCourseRepository.delete.mockImplementation(async () => {
          callOrder.push('courseRepository.delete');
          return true;
        });

        // When
        await courseService.delete(course._id.toString(), authorId);

        // Then
        expect(mockLessonService.deleteAllForCourse).toHaveBeenCalledWith(course._id.toString());
        expect(mockCourseRepository.delete).toHaveBeenCalledWith(course._id.toString());
        expect(callOrder).toEqual(['deleteAllForCourse', 'courseRepository.delete']);
      });
    });
  });

  describe('addRating', () => {
    describe('Когда курс не найден', () => {
      it('должен выбросить 404', async () => {
        // Given
        mockCourseRepository.findById.mockResolvedValue(null);

        // When & Then
        await expect(
          courseService.addRating('507f1f77bcf86cd799439011', new Types.ObjectId(), 5)
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    describe.each([0, 6, -1])('Когда значение рейтинга вне диапазона 1-5 (%i)', value => {
      it('должен выбросить 400, не сохраняя оценку', async () => {
        // Given
        const course = createMockCourse();
        mockCourseRepository.findById.mockResolvedValue(course);

        // When & Then
        await expect(courseService.addRating(course._id.toString(), new Types.ObjectId(), value)).rejects.toMatchObject(
          { status: 400 }
        );
        expect(mockCourseRepository.addRating).not.toHaveBeenCalled();
      });
    });

    describe('Когда значение в диапазоне 1-5', () => {
      it('должен сохранить оценку с переданным userId и value', async () => {
        // Given
        const course = createMockCourse();
        const userId = new Types.ObjectId();
        mockCourseRepository.findById.mockResolvedValue(course);
        mockCourseRepository.addRating.mockResolvedValue(course);

        // When
        await courseService.addRating(course._id.toString(), userId, 4);

        // Then
        expect(mockCourseRepository.addRating).toHaveBeenCalledWith(
          course._id.toString(),
          expect.objectContaining({ userId, value: 4 })
        );
      });
    });
  });

  describe('getMyCourses', () => {
    describe('Когда роль — author', () => {
      it('должен вернуть курсы, которые пользователь ведёт (findByAuthor)', async () => {
        // Given
        const userId = new Types.ObjectId();
        mockCourseRepository.findByAuthor.mockResolvedValue([]);

        // When
        await courseService.getMyCourses(userId, 'author');

        // Then
        expect(mockCourseRepository.findByAuthor).toHaveBeenCalledWith(userId.toString());
        expect(mockCourseRepository.findByAllowedUser).not.toHaveBeenCalled();
      });
    });

    describe('Когда роль — admin', () => {
      it('должен вернуть курсы через findByAuthor (тот же путь, что и author)', async () => {
        // Given
        const userId = new Types.ObjectId();
        mockCourseRepository.findByAuthor.mockResolvedValue([]);

        // When
        await courseService.getMyCourses(userId, 'admin');

        // Then
        expect(mockCourseRepository.findByAuthor).toHaveBeenCalledWith(userId.toString());
      });
    });

    describe('Когда роль — student', () => {
      it('должен вернуть курсы через allowedUsers (findByAllowedUser), не findByAuthor', async () => {
        // Given
        const userId = new Types.ObjectId();
        mockCourseRepository.findByAllowedUser.mockResolvedValue([]);

        // When
        await courseService.getMyCourses(userId, 'student');

        // Then
        expect(mockCourseRepository.findByAllowedUser).toHaveBeenCalledWith(userId.toString());
        expect(mockCourseRepository.findByAuthor).not.toHaveBeenCalled();
      });
    });
  });

  describe('addLesson', () => {
    describe('Когда курс не найден', () => {
      it('должен выбросить 404', async () => {
        mockCourseRepository.findById.mockResolvedValue(null);

        await expect(
          courseService.addLesson('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', new Types.ObjectId())
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403', async () => {
        const course = createMockCourse({ author: new Types.ObjectId() });
        mockCourseRepository.findById.mockResolvedValue(course);

        await expect(
          courseService.addLesson(course._id.toString(), '507f1f77bcf86cd799439012', new Types.ObjectId())
        ).rejects.toMatchObject({ status: 403 });
      });
    });
  });

  describe('removeLesson', () => {
    describe('Когда курс не найден', () => {
      it('должен выбросить 404', async () => {
        mockCourseRepository.findById.mockResolvedValue(null);

        await expect(
          courseService.removeLesson('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', new Types.ObjectId())
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403, не отвязывая урок', async () => {
        const course = createMockCourse({ author: new Types.ObjectId() });
        mockCourseRepository.findById.mockResolvedValue(course);

        await expect(
          courseService.removeLesson(course._id.toString(), '507f1f77bcf86cd799439012', new Types.ObjectId())
        ).rejects.toMatchObject({ status: 403 });
        expect(mockCourseRepository.removeLesson).not.toHaveBeenCalled();
      });
    });

    describe('Когда вызывающий — автор курса', () => {
      it('должен отвязать урок от курса, преобразовав lessonId в ObjectId', async () => {
        const authorId = new Types.ObjectId();
        const course = createMockCourse({ author: authorId });
        const lessonId = new Types.ObjectId().toString();
        mockCourseRepository.findById.mockResolvedValue(course);
        mockCourseRepository.removeLesson.mockResolvedValue(course);

        await courseService.removeLesson(course._id.toString(), lessonId, authorId);

        const [calledCourseId, calledLessonId] = mockCourseRepository.removeLesson.mock.calls[0];
        expect(calledCourseId).toBe(course._id.toString());
        expect((calledLessonId as Types.ObjectId).toString()).toBe(lessonId);
      });
    });
  });

  describe('addUserToAllowed', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403, даже если вызывающий верифицирован', async () => {
        const course = createMockCourse({ author: new Types.ObjectId() });
        mockCourseRepository.findById.mockResolvedValue(course);

        await expect(
          courseService.addUserToAllowed(course._id.toString(), new Types.ObjectId(), new Types.ObjectId())
        ).rejects.toMatchObject({ status: 403 });
      });
    });
  });

  describe('removeUserFromAllowed', () => {
    describe('Когда курс не найден', () => {
      it('должен выбросить 404', async () => {
        mockCourseRepository.findById.mockResolvedValue(null);

        await expect(
          courseService.removeUserFromAllowed('507f1f77bcf86cd799439011', new Types.ObjectId(), new Types.ObjectId())
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403', async () => {
        const course = createMockCourse({ author: new Types.ObjectId() });
        mockCourseRepository.findById.mockResolvedValue(course);

        await expect(
          courseService.removeUserFromAllowed(course._id.toString(), new Types.ObjectId(), new Types.ObjectId())
        ).rejects.toMatchObject({ status: 403 });
      });
    });
  });

  describe('getById', () => {
    describe('Когда курс не найден', () => {
      it('должен выбросить 404', async () => {
        mockCourseRepository.findById.mockResolvedValue(null);

        await expect(courseService.getById('507f1f77bcf86cd799439011')).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('Когда курс найден', () => {
      it('должен вернуть курс как есть', async () => {
        const course = createMockCourse();
        mockCourseRepository.findById.mockResolvedValue(course);

        const result = await courseService.getById(course._id.toString());

        expect(result).toBe(course);
      });
    });
  });
});
