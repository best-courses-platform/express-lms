import { Course, NewCourse, Rating } from './course.types';
import { courseRepository } from './course.repository';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { Types } from 'mongoose';
import { CreateCourseInput, UpdateCourseInput } from './course.schema';
import { COURSE_MESSAGES } from './course.constants';
import { lessonService } from 'lessons/lesson.service';
import { enrollmentService } from 'enrollments/enrollment.service';

class CourseService {
  async create(input: CreateCourseInput, authorId: Types.ObjectId): Promise<Course> {
    const exists = await courseRepository.findByTitle(input.title);

    if (exists) {
      throw new ConflictError(COURSE_MESSAGES.ERROR.ALREADY_EXISTS);
    }

    const courseData: NewCourse = {
      ...input,
      author: authorId,
      isPublished: input.isPublished ?? false,
    };

    return courseRepository.create(courseData);
  }

  async update(id: string, patch: UpdateCourseInput, userId: Types.ObjectId): Promise<Course> {
    const course = await courseRepository.findById(id);

    if (!course) {
      throw new NotFoundError(COURSE_MESSAGES.ERROR.NOT_FOUND);
    }

    if (!course.author.equals(userId)) {
      throw new ForbiddenError(COURSE_MESSAGES.ERROR.NOT_AUTHOR);
    }

    if (patch.title && patch.title !== course.title) {
      const exists = await courseRepository.findByTitle(patch.title);
      if (exists) {
        throw new ConflictError(COURSE_MESSAGES.ERROR.ALREADY_EXISTS);
      }
    }

    return courseRepository.update(id, patch);
  }

  async list(): Promise<Course[]> {
    return courseRepository.findAll();
  }

  async getPublishedCourses(): Promise<Course[]> {
    return courseRepository.findPublished();
  }

  async getCoursesByAuthor(authorId: string): Promise<Course[]> {
    return courseRepository.findByAuthor(authorId);
  }

  /**
   * "Мои курсы" для личного кабинета: у автора/админа — курсы, которые он ведёт,
   * у студента — курсы, на которые он активно записан (Enrollment, своего списка
   * "изучаю" отдельно от факта доступа ещё нет).
   */
  async getMyCourses(userId: Types.ObjectId, role: string): Promise<Course[]> {
    if (role === 'author' || role === 'admin') {
      return courseRepository.findByAuthor(userId.toString());
    }

    const courseIds = await enrollmentService.getEnrolledCourseIds(userId);
    return courseRepository.findByIds(courseIds);
  }

  async getCoursesByDifficulty(difficulty: string): Promise<Course[]> {
    return courseRepository.findByDifficulty(difficulty);
  }

  async search(query: string): Promise<Course[]> {
    if (!query.trim()) {
      throw new BadRequestError(COURSE_MESSAGES.VALIDATION.SEARCH_QUERY_REQUIRED);
    }
    return courseRepository.search(query);
  }

  async getById(id: string): Promise<Course> {
    const course = await courseRepository.findById(id);
    if (!course) {
      throw new NotFoundError(COURSE_MESSAGES.ERROR.NOT_FOUND);
    }

    return course;
  }

  /**
   * Доступ к непубликованному курсу — только автор и активно записанные студенты (Enrollment).
   * Опубликованный курс виден всем, включая анонимных пользователей (userId не передан).
   */
  async canAccess(course: Course, userId?: Types.ObjectId): Promise<boolean> {
    if (course.isPublished) {
      return true;
    }

    if (!userId) {
      return false;
    }

    if (course.author.equals(userId)) {
      return true;
    }

    return enrollmentService.isEnrolled(course._id, userId);
  }

  async delete(id: string, userId: Types.ObjectId): Promise<void> {
    const course = await courseRepository.findById(id);
    if (!course) {
      throw new NotFoundError(COURSE_MESSAGES.ERROR.NOT_FOUND);
    }

    if (!course.author.equals(userId)) {
      throw new ForbiddenError(COURSE_MESSAGES.ERROR.NOT_AUTHOR);
    }

    // Уроки курса и их файлы в S3 иначе остаются висеть навсегда — ничего, кроме этого
    // вызова, их не подчищает (см. Obsidian: та же проблема "сирот", что и при прямом
    // удалении курса через mongosh, только теперь она была и в штатном API-пути).
    await lessonService.deleteAllForCourse(id);

    const ok = await courseRepository.delete(id);
    if (!ok) {
      throw new NotFoundError(COURSE_MESSAGES.ERROR.NOT_FOUND);
    }
  }

  async addLesson(courseId: string, lessonId: string, userId: Types.ObjectId): Promise<Course> {
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError(COURSE_MESSAGES.ERROR.NOT_FOUND);
    }

    if (!course.author.equals(userId)) {
      throw new ForbiddenError(COURSE_MESSAGES.ERROR.NOT_AUTHOR);
    }

    return courseRepository.addLesson(courseId, new Types.ObjectId(lessonId));
  }

  async removeLesson(courseId: string, lessonId: string, userId: Types.ObjectId): Promise<Course> {
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError(COURSE_MESSAGES.ERROR.NOT_FOUND);
    }

    if (!course.author.equals(userId)) {
      throw new ForbiddenError(COURSE_MESSAGES.ERROR.NOT_AUTHOR);
    }

    return courseRepository.removeLesson(courseId, new Types.ObjectId(lessonId));
  }

  async addRating(courseId: string, userId: Types.ObjectId, value: number): Promise<Course> {
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError(COURSE_MESSAGES.ERROR.NOT_FOUND);
    }

    if (value < 1 || value > 5) {
      throw new BadRequestError(COURSE_MESSAGES.VALIDATION.RATING_MIN);
    }

    return courseRepository.addRating(courseId, {
      userId: userId,
      value,
      createdAt: new Date(),
    });
  }

  async getRatings(courseId: string): Promise<Rating[]> {
    const course = await courseRepository.findById(courseId);
    if (!course) {
      throw new NotFoundError(COURSE_MESSAGES.ERROR.NOT_FOUND);
    }
    return courseRepository.getRatingsByCourse(courseId);
  }
}

export const courseService = new CourseService();
