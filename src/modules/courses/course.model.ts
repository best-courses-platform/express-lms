import { model, Schema } from 'mongoose';
import { Course } from './course.types';

const courseSchema = new Schema<Course>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    previewImage: {
      type: String,
      required: true,
      trim: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 30,
      },
    ],
    difficulty: {
      type: String,
      required: true,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    lessons: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Lesson',
        default: [],
      },
    ],
    // Поддерживается атомарным $inc в courseRepository.addLesson/removeLesson — не
    // count() по populate() при каждом чтении списка курсов (см. Obsidian: highload).
    lessonsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // ratingSum/ratingCount — поддерживаются pipeline-update в courseRepository.addRating
    // (rating.model.ts — источник истины по отдельным оценкам). averageRating — их
    // производная, тоже пересчитывается там же одной атомарной операцией, а не в Node.
    ratingSum: {
      type: Number,
      default: 0,
      min: 0,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    allowedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: [],
      },
    ],
  },
  {
    timestamps: true, // автоматически добавляет createdAt и updatedAt
  }
);

// Индексы для оптимизации запросов
// title/description — используется courseRepository.search() через $text (найден раньше
// объявленным, но неиспользуемым — платили за поддержку индекса на каждую запись без
// единой пользы; см. Obsidian: "Обход ORM на горячих путях"). Нативный полнотекстовый
// поиск MongoDB — эта задача не требует Elasticsearch на масштабе "сотни курсов".
courseSchema.index({ title: 'text', description: 'text' });
courseSchema.index({ author: 1 });
courseSchema.index({ difficulty: 1 });
courseSchema.index({ isPublished: 1 });
courseSchema.index({ averageRating: -1 });
courseSchema.index({ createdAt: -1 });

export const CourseModel = model<Course>('Course', courseSchema);
