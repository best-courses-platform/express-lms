import { model, Schema } from 'mongoose';
import { Rating } from './course.types';

// Отдельная коллекция вместо embedded-массива внутри Course — см. course.types.ts.
// Даёт то, что embedded-массив дать не может: атомарный upsert "одна оценка на
// пользователя" за один round-trip к БД (уникальный индекс ниже), без предварительного
// чтения всего списка оценок курса и без риска, что документ Course разрастётся
// до лимита 16MB при большом числе оценок на популярный курс.
const ratingSchema = new Schema<Rating>({
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
  value: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// unique — гарантирует "одна оценка на пользователя на курс" на уровне БД (не только
// в коде): findOneAndUpdate({courseId, userId}, ..., {upsert: true}) в course.repository.ts
// полагается ровно на этот индекс, чтобы оставаться атомарным при параллельных запросах.
// courseId первым полем — этот же индекс обслуживает getRatingsByCourse() (листинг
// оценок конкретного курса) как префиксное сканирование, отдельный индекс не нужен.
ratingSchema.index({ courseId: 1, userId: 1 }, { unique: true });

export const RatingModel = model<Rating>('Rating', ratingSchema);
