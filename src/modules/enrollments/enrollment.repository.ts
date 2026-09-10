import mongoose, { Types } from 'mongoose';
import { EnrollmentModel } from './enrollment.model';
import { Enrollment } from './enrollment.types';
import { CourseModel } from '../courses/course.model';

class EnrollmentRepository {
  /**
   * Записывает пользователя на курс (upsert: первая запись создаёт документ, повторная
   * после отзыва — флипает существующий обратно в 'active'). Тот же паттерн атомарной
   * дельты, что и у courseRepository.addRating: findOneAndUpdate с new:false отдаёт
   * состояние ДО апдейта, по нему считаем дельту studentsCount, не читая Course отдельно.
   * Обёрнуто в транзакцию — обновление Course.studentsCount должно быть согласовано
   * с созданием/флипом самой записи Enrollment, а не отдельным нетранзакционным шагом.
   */
  async setActive(courseId: Types.ObjectId, userId: Types.ObjectId): Promise<Enrollment> {
    let result: Enrollment | null = null;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const previous = await EnrollmentModel.findOneAndUpdate(
          { courseId, userId },
          { $set: { status: 'active', enrolledAt: new Date() } },
          { upsert: true, new: false, setDefaultsOnInsert: true, session }
        ).exec();

        // Уже был активен — идемпотентный повторный вызов, studentsCount не трогаем.
        const delta = previous && previous.status === 'active' ? 0 : 1;

        if (delta !== 0) {
          await CourseModel.findByIdAndUpdate(courseId, { $inc: { studentsCount: delta } }, { session }).exec();
        }

        result = await EnrollmentModel.findOne({ courseId, userId }, null, { session }).exec();
      });
    } finally {
      await session.endSession();
    }

    if (!result) {
      throw new Error('Enrollment not found after upsert');
    }

    return result;
  }

  /**
   * Отзывает доступ (soft-delete через status, не удаление документа — см. enrollment.types.ts).
   * Возвращает null, если пользователь и так не был активно записан (идемпотентно, не ошибка).
   */
  async setRevoked(courseId: Types.ObjectId, userId: Types.ObjectId): Promise<Enrollment | null> {
    let result: Enrollment | null = null;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const revoked = await EnrollmentModel.findOneAndUpdate(
          { courseId, userId, status: 'active' },
          { $set: { status: 'revoked' } },
          { new: true, session }
        ).exec();

        if (revoked) {
          await CourseModel.findByIdAndUpdate(courseId, { $inc: { studentsCount: -1 } }, { session }).exec();
        }

        result = revoked;
      });
    } finally {
      await session.endSession();
    }

    return result;
  }

  async isActive(courseId: Types.ObjectId, userId: Types.ObjectId): Promise<boolean> {
    const exists = await EnrollmentModel.exists({ courseId, userId, status: 'active' }).exec();
    return exists !== null;
  }

  /**
   * Активные записи курса — для экрана автора "студенты на курсе".
   */
  async findActiveByCourse(courseId: Types.ObjectId): Promise<Enrollment[]> {
    return EnrollmentModel.find({ courseId, status: 'active' })
      .populate('userId', 'name email')
      .sort({ enrolledAt: -1 })
      .exec();
  }

  /**
   * ID курсов, на которые студент активно записан — источник для courseService.getMyCourses,
   * не отдельный метод в course.repository.ts (границы модуля: enrollments не знает деталей
   * Course, кроме его id, а courses не знает деталей Enrollment, кроме списка id).
   */
  async findActiveCourseIdsForUser(userId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const enrollments = await EnrollmentModel.find({ userId, status: 'active' }, { courseId: 1 }).exec();
    return enrollments.map(e => e.courseId);
  }

  /**
   * Удаление курса — вызывается ДО courseRepository.delete(id). Сам курс (со своим
   * studentsCount) через мгновение исчезнет целиком, поэтому просто deleteMany без
   * дельты счётчика: пересчитывать поле документа, который вот-вот удалят, бессмысленно.
   * Без этого вызова записи на курс становятся сиротами — тот же класс проблемы, что
   * решался для уроков в courseService.delete() (см. Рефакторинг проблем/16), только
   * не был устранён для Enrollment при его введении.
   */
  async deleteAllForCourse(courseId: Types.ObjectId): Promise<void> {
    await EnrollmentModel.deleteMany({ courseId }).exec();
  }

  /**
   * Удаление пользователя — в отличие от deleteAllForCourse выше, соседние курсы
   * остаются существовать, поэтому их studentsCount нужно честно уменьшить, а не
   * просто снести записи молча (иначе агрегат тихо разойдётся с реальностью — тот же
   * риск, что denormalized-counter паттерн специально предотвращает при обычной работе
   * enroll/unenroll, см. Obsidian: "Денормализованные счётчики и soft-delete через status").
   * Удаляются ВСЕ записи (активные и отозванные) — истории после удаления пользователя
   * хранить не для кого, оставлять ссылку на несуществующий userId — не "мягкое" решение,
   * а просто новый, другой вид сироты.
   */
  async deleteAllForUser(userId: Types.ObjectId): Promise<void> {
    const activeEnrollments = await EnrollmentModel.find({ userId, status: 'active' }, { courseId: 1 }).exec();

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await EnrollmentModel.deleteMany({ userId }, { session });

        for (const enrollment of activeEnrollments) {
          await CourseModel.findByIdAndUpdate(enrollment.courseId, { $inc: { studentsCount: -1 } }, { session }).exec();
        }
      });
    } finally {
      await session.endSession();
    }
  }
}

export const enrollmentRepository = new EnrollmentRepository();
