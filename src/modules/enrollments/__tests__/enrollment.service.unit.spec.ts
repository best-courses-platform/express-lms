import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Types } from 'mongoose';
import type { enrollmentRepository as EnrollmentRepositoryInstance } from '../enrollment.repository';
import type { courseRepository as CourseRepositoryInstance } from 'courses/course.repository';
import type { userRepository as UserRepositoryInstance } from 'users/user.repository';
import type { enrollmentService as EnrollmentServiceInstance } from '../enrollment.service';
import type { Course } from 'courses/course.types';
import type { Enrollment } from '../enrollment.types';

// Unit-слой: enrollmentRepository/courseRepository/userRepository замоканы — проверяем
// только бизнес-логику enrollmentService (владение курсом, резолв email→user, ветвление),
// не то, что реально происходит в MongoDB (для этого — course.routes.integration.spec.ts).
jest.mock('../enrollment.repository', () => ({
  enrollmentRepository: {
    setActive: jest.fn(),
    setRevoked: jest.fn(),
    isActive: jest.fn(),
    findActiveByCourse: jest.fn(),
    findActiveCourseIdsForUser: jest.fn(),
  },
}));
jest.mock('courses/course.repository', () => ({
  courseRepository: {
    findById: jest.fn(),
  },
}));
jest.mock('users/user.repository', () => ({
  userRepository: {
    findByEmail: jest.fn(),
  },
}));

const { enrollmentRepository } = require('../enrollment.repository') as {
  enrollmentRepository: typeof EnrollmentRepositoryInstance;
};
const { courseRepository } = require('courses/course.repository') as { courseRepository: typeof CourseRepositoryInstance };
const { userRepository } = require('users/user.repository') as { userRepository: typeof UserRepositoryInstance };
const { enrollmentService } = require('../enrollment.service') as { enrollmentService: typeof EnrollmentServiceInstance };

const mockEnrollmentRepository = enrollmentRepository as jest.Mocked<typeof enrollmentRepository>;
const mockCourseRepository = courseRepository as jest.Mocked<typeof courseRepository>;
const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;

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
    lessonsCount: 0,
    ratingSum: 0,
    ratingCount: 0,
    averageRating: 0,
    isPublished: false,
    studentsCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Course;
}

function createMockEnrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    _id: new Types.ObjectId(),
    courseId: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    status: 'active',
    enrolledAt: new Date(),
    ...overrides,
  } as Enrollment;
}

describe('EnrollmentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('enrollByEmail', () => {
    describe('Когда курс не найден', () => {
      it('должен выбросить 404, не обращаясь к userRepository', async () => {
        mockCourseRepository.findById.mockResolvedValue(null);

        await expect(
          enrollmentService.enrollByEmail('507f1f77bcf86cd799439011', 'student@example.com', new Types.ObjectId())
        ).rejects.toMatchObject({ status: 404 });
        expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      });
    });

    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403, не обращаясь к userRepository', async () => {
        const course = createMockCourse({ author: new Types.ObjectId() });
        mockCourseRepository.findById.mockResolvedValue(course);

        await expect(
          enrollmentService.enrollByEmail(course._id.toString(), 'student@example.com', new Types.ObjectId())
        ).rejects.toMatchObject({ status: 403 });
        expect(mockUserRepository.findByEmail).not.toHaveBeenCalled();
      });
    });

    describe('Когда пользователь с таким email не найден', () => {
      it('должен выбросить 404, не обращаясь к enrollmentRepository', async () => {
        const authorId = new Types.ObjectId();
        const course = createMockCourse({ author: authorId });
        mockCourseRepository.findById.mockResolvedValue(course);
        mockUserRepository.findByEmail.mockResolvedValue(null);

        await expect(
          enrollmentService.enrollByEmail(course._id.toString(), 'no-such-user@example.com', authorId)
        ).rejects.toMatchObject({ status: 404 });
        expect(mockEnrollmentRepository.setActive).not.toHaveBeenCalled();
      });
    });

    describe('Когда автор записывает существующего пользователя', () => {
      it('должен вызвать enrollmentRepository.setActive с id курса и найденного пользователя', async () => {
        const authorId = new Types.ObjectId();
        const course = createMockCourse({ author: authorId });
        const student = { _id: new Types.ObjectId(), email: 'student@example.com' };
        mockCourseRepository.findById.mockResolvedValue(course);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockUserRepository.findByEmail.mockResolvedValue(student as any);
        const enrollment = createMockEnrollment({ courseId: course._id, userId: student._id });
        mockEnrollmentRepository.setActive.mockResolvedValue(enrollment);

        const result = await enrollmentService.enrollByEmail(course._id.toString(), student.email, authorId);

        expect(result).toBe(enrollment);
        expect(mockEnrollmentRepository.setActive).toHaveBeenCalledWith(course._id, student._id);
      });
    });
  });

  describe('unenroll', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403, не обращаясь к enrollmentRepository', async () => {
        const course = createMockCourse({ author: new Types.ObjectId() });
        mockCourseRepository.findById.mockResolvedValue(course);

        await expect(
          enrollmentService.unenroll(course._id.toString(), new Types.ObjectId().toString(), new Types.ObjectId())
        ).rejects.toMatchObject({ status: 403 });
        expect(mockEnrollmentRepository.setRevoked).not.toHaveBeenCalled();
      });
    });

    describe('Когда пользователь не был активно записан', () => {
      it('должен выбросить 404', async () => {
        const authorId = new Types.ObjectId();
        const course = createMockCourse({ author: authorId });
        mockCourseRepository.findById.mockResolvedValue(course);
        mockEnrollmentRepository.setRevoked.mockResolvedValue(null);

        await expect(
          enrollmentService.unenroll(course._id.toString(), new Types.ObjectId().toString(), authorId)
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    describe('Когда пользователь был активно записан', () => {
      it('должен успешно отозвать доступ', async () => {
        const authorId = new Types.ObjectId();
        const course = createMockCourse({ author: authorId });
        const userId = new Types.ObjectId();
        mockCourseRepository.findById.mockResolvedValue(course);
        mockEnrollmentRepository.setRevoked.mockResolvedValue(createMockEnrollment({ status: 'revoked' }));

        await expect(
          enrollmentService.unenroll(course._id.toString(), userId.toString(), authorId)
        ).resolves.toBeUndefined();
        expect(mockEnrollmentRepository.setRevoked).toHaveBeenCalledWith(course._id, userId);
      });
    });
  });

  describe('listStudents', () => {
    describe('Когда вызывающий не автор курса', () => {
      it('должен выбросить 403', async () => {
        const course = createMockCourse({ author: new Types.ObjectId() });
        mockCourseRepository.findById.mockResolvedValue(course);

        await expect(enrollmentService.listStudents(course._id.toString(), new Types.ObjectId())).rejects.toMatchObject(
          { status: 403 }
        );
      });
    });

    describe('Когда вызывающий — автор курса', () => {
      it('должен вернуть активные записи курса', async () => {
        const authorId = new Types.ObjectId();
        const course = createMockCourse({ author: authorId });
        mockCourseRepository.findById.mockResolvedValue(course);
        const enrollments = [createMockEnrollment({ courseId: course._id })];
        mockEnrollmentRepository.findActiveByCourse.mockResolvedValue(enrollments);

        const result = await enrollmentService.listStudents(course._id.toString(), authorId);

        expect(result).toBe(enrollments);
        expect(mockEnrollmentRepository.findActiveByCourse).toHaveBeenCalledWith(course._id);
      });
    });
  });

  describe('isEnrolled', () => {
    it('должен делегировать в enrollmentRepository.isActive', async () => {
      const courseId = new Types.ObjectId();
      const userId = new Types.ObjectId();
      mockEnrollmentRepository.isActive.mockResolvedValue(true);

      await expect(enrollmentService.isEnrolled(courseId, userId)).resolves.toBe(true);
      expect(mockEnrollmentRepository.isActive).toHaveBeenCalledWith(courseId, userId);
    });
  });

  describe('getEnrolledCourseIds', () => {
    it('должен делегировать в enrollmentRepository.findActiveCourseIdsForUser', async () => {
      const userId = new Types.ObjectId();
      const courseIds = [new Types.ObjectId()];
      mockEnrollmentRepository.findActiveCourseIdsForUser.mockResolvedValue(courseIds);

      await expect(enrollmentService.getEnrolledCourseIds(userId)).resolves.toBe(courseIds);
      expect(mockEnrollmentRepository.findActiveCourseIdsForUser).toHaveBeenCalledWith(userId);
    });
  });
});
