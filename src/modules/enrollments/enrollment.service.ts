import { Types } from 'mongoose';
import { enrollmentRepository } from './enrollment.repository';
import { Enrollment } from './enrollment.types';
import { ENROLLMENT_MESSAGES } from './enrollment.constants';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { courseRepository } from 'courses/course.repository';
import { userRepository } from 'users/user.repository';

class EnrollmentService {
  /**
   * Проверка владения курсом — общая для enroll/unenroll/listStudents, не продублирована
   * в каждом методе по отдельности. Намеренно читает курс через courseRepository, а не
   * courseService — избегаем циклической зависимости (courseService сам зовёт этот сервис
   * в canAccess/getMyCourses, см. course.service.ts).
   */
  private async assertIsAuthor(courseId: string, authorId: Types.ObjectId): Promise<void> {
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError(ENROLLMENT_MESSAGES.ERROR.COURSE_NOT_FOUND);
    }
    if (!course.author.equals(authorId)) {
      throw new ForbiddenError(ENROLLMENT_MESSAGES.ERROR.NOT_AUTHOR);
    }
  }

  /**
   * Записывает студента на курс по email (не по userId) — автор курса обычно знает email
   * студента, не его внутренний ObjectId, и это избавляет от отдельного admin-подобного
   * эндпоинта "найти пользователя по id" только ради этой формы.
   */
  async enrollByEmail(courseId: string, email: string, authorId: Types.ObjectId): Promise<Enrollment> {
    await this.assertIsAuthor(courseId, authorId);

    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundError(ENROLLMENT_MESSAGES.ERROR.USER_NOT_FOUND);
    }

    return enrollmentRepository.setActive(new Types.ObjectId(courseId), user._id);
  }

  async unenroll(courseId: string, userId: string, authorId: Types.ObjectId): Promise<void> {
    await this.assertIsAuthor(courseId, authorId);

    const revoked = await enrollmentRepository.setRevoked(new Types.ObjectId(courseId), new Types.ObjectId(userId));
    if (!revoked) {
      throw new NotFoundError(ENROLLMENT_MESSAGES.ERROR.NOT_ENROLLED);
    }
  }

  async listStudents(courseId: string, authorId: Types.ObjectId): Promise<Enrollment[]> {
    await this.assertIsAuthor(courseId, authorId);

    return enrollmentRepository.findActiveByCourse(new Types.ObjectId(courseId));
  }

  /**
   * Источник доступа для courseService.canAccess/lessonService.checkUserAccess —
   * единственное место, знающее, что "доступ" сейчас реализован через Enrollment,
   * а не через Course.allowedUsers.
   */
  async isEnrolled(courseId: Types.ObjectId, userId: Types.ObjectId): Promise<boolean> {
    return enrollmentRepository.isActive(courseId, userId);
  }

  /**
   * ID курсов для courseService.getMyCourses (роль student) — courses не читает Enrollment
   * напрямую, только через этот сервис (границы модуля, см. enrollment.repository.ts).
   */
  async getEnrolledCourseIds(userId: Types.ObjectId): Promise<Types.ObjectId[]> {
    return enrollmentRepository.findActiveCourseIdsForUser(userId);
  }

  /** Вызывается из courseService.delete() — см. enrollmentRepository.deleteAllForCourse. */
  async deleteAllForCourse(courseId: string): Promise<void> {
    await enrollmentRepository.deleteAllForCourse(new Types.ObjectId(courseId));
  }

  /** Вызывается из userService.delete() — см. enrollmentRepository.deleteAllForUser. */
  async deleteAllForUser(userId: string): Promise<void> {
    await enrollmentRepository.deleteAllForUser(new Types.ObjectId(userId));
  }
}

export const enrollmentService = new EnrollmentService();
