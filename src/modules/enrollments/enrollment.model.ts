import { model, Schema } from 'mongoose';
import { Enrollment } from './enrollment.types';

// Отдельная коллекция вместо embedded allowedUsers[] внутри Course — тот же мотив, что и
// у Rating (см. course.repository.ts/rating.model.ts): атомарный upsert "одна запись на пару
// курс+пользователь" за один round-trip к БД, без риска разрастить документ Course до лимита
// 16MB на популярном курсе, плюс не нужно тянуть весь список студентов ради проверки доступа
// одного из них.
const enrollmentSchema = new Schema<Enrollment>({
  courseId: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'revoked'],
    default: 'active',
  },
  enrolledAt: {
    type: Date,
    default: Date.now,
  },
});

// unique — одна запись на пару курс+пользователь НАВСЕГДА, не только пока активна: повторная
// запись после отзыва переиспользует тот же документ (флип status обратно в 'active',
// enrolledAt обновляется), а не создаёт вторую строку. courseId первым полем — тот же индекс
// обслуживает enrollmentRepository.findActiveByCourse() (листинг активных студентов курса)
// как префиксное сканирование, отдельный индекс под courseId не нужен.
enrollmentSchema.index({ courseId: 1, userId: 1 }, { unique: true });
// Обратный порядок полей — под getMyCourses() студента: все его активные записи, из
// подходящих индексов ни один не обслуживает этот запрос как префикс (userId не первый в том).
enrollmentSchema.index({ userId: 1, status: 1 });

export const EnrollmentModel = model<Enrollment>('Enrollment', enrollmentSchema);
