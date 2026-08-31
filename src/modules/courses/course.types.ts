import { Types } from 'mongoose';

// Оценка — отдельная коллекция (rating.model.ts), не embedded-массив внутри Course.
// courseId нужен здесь, а не только в контексте курса, потому что RatingModel
// хранит документы плоско, без вложенности — см. Obsidian: "Обход ORM на горячих
// путях" — раньше это был Course.ratings[], пересчёт average шёл вручную в Node
// (4 последовательных запроса + JS reduce на каждую оценку, гонки при параллельных
// запросах, неограниченно растущий embedded-массив внутри одного документа).
export type Rating = {
  courseId: Types.ObjectId;
  userId: Types.ObjectId;
  value: number;
  createdAt: Date;
};

export type Course = {
  _id: Types.ObjectId;
  title: string;
  description: string;
  previewImage: string;
  author: Types.ObjectId; // теперь ссылка на пользователя
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  lessons?: Types.ObjectId[]; // массив уроков курса
  // Счётчики, поддерживаемые атомарными $inc/pipeline-update в course.repository.ts
  // (addLesson/removeLesson/addRating), а не пересчётом в Node — O(1) на запись
  // независимо от того, сколько всего уроков/оценок накопилось у курса.
  lessonsCount: number;
  ratingSum: number;
  ratingCount: number;
  averageRating?: number;
  isPublished: boolean;
  allowedUsers: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
};

export type NewCourse = Omit<
  Course,
  | '_id'
  | 'createdAt'
  | 'updatedAt'
  | 'averageRating'
  | 'lessons'
  | 'lessonsCount'
  | 'ratingSum'
  | 'ratingCount'
  | 'allowedUsers'
>;

export type UpdateCourse = Partial<
  Omit<
    Course,
    | '_id'
    | 'createdAt'
    | 'updatedAt'
    | 'averageRating'
    | 'lessons'
    | 'lessonsCount'
    | 'ratingSum'
    | 'ratingCount'
    | 'allowedUsers'
    | 'author'
  >
>;
