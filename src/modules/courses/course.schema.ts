import { z } from 'zod';
import { COURSE_MESSAGES } from './course.constants';

// Поля без .default() — единственный источник правил валидации, переиспользуется и
// созданием (через courseBaseSchema ниже), и обновлением (courseFieldsSchema.partial()
// напрямую). Если бы updateCourseSchema строился через courseBaseSchema.partial(),
// каждое отсутствующее в PATCH-теле поле с .default() (tags/difficulty/isPublished)
// тихо получало бы дефолт вместо того, чтобы остаться нетронутым — Zod применяет
// .default() к отсутствующему значению независимо от внешней .optional()-обёртки,
// которую добавляет .partial(). На практике это стирало теги/публикацию при PATCH
// с одним изменённым полем (например, только title).
const courseFieldsSchema = z.object({
  title: z
    .string()
    .min(1, COURSE_MESSAGES.VALIDATION.TITLE_REQUIRED)
    .max(100, COURSE_MESSAGES.VALIDATION.TITLE_TOO_LONG),
  description: z
    .string()
    .min(10, COURSE_MESSAGES.VALIDATION.DESCRIPTION_TOO_SHORT)
    .max(1000, COURSE_MESSAGES.VALIDATION.DESCRIPTION_TOO_LONG),
  previewImage: z
    .string()
    .url(COURSE_MESSAGES.VALIDATION.PREVIEW_IMAGE_INVALID)
    .min(1, COURSE_MESSAGES.VALIDATION.PREVIEW_IMAGE_REQUIRED),
  tags: z
    .array(z.string().max(30, COURSE_MESSAGES.VALIDATION.TAG_TOO_LONG))
    .max(10, COURSE_MESSAGES.VALIDATION.TAGS_TOO_MANY),
  difficulty: z
    .enum(['beginner', 'intermediate', 'advanced'])
    .refine(val => ['beginner', 'intermediate', 'advanced'].includes(val), {
      message: COURSE_MESSAGES.VALIDATION.DIFFICULTY_INVALID,
    }),
  isPublished: z.boolean(),
});

// Базовая схема для создания — те же поля, но с дефолтами (создание допускает
// частичный набор полей и хочет получить осмысленные значения по умолчанию).
export const courseBaseSchema = courseFieldsSchema.extend({
  tags: courseFieldsSchema.shape.tags.default([]),
  difficulty: courseFieldsSchema.shape.difficulty.default('beginner'),
  isPublished: courseFieldsSchema.shape.isPublished.default(false),
});

// Создание курса
// author НЕ часть тела запроса — берётся из req.user на сервере (см. course.controller.ts),
// иначе любой залогиненный пользователь мог бы создать курс "от имени" чужого автора.
export const createCourseSchema = z.object({
  body: courseBaseSchema,
});

// Обновление курса — courseFieldsSchema (без .default()), не courseBaseSchema, см.
// комментарий выше про Zod .partial() + .default().
export const updateCourseSchema = z.object({
  params: z.object({
    id: z.string().min(1, COURSE_MESSAGES.VALIDATION.COURSE_ID_REQUIRED),
  }),
  body: courseFieldsSchema.partial().refine(data => Object.keys(data).length > 0, {
    message: COURSE_MESSAGES.VALIDATION.AT_LEAST_ONE_FIELD,
  }),
});

// ID параметр
export const idParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, COURSE_MESSAGES.VALIDATION.COURSE_ID_REQUIRED),
  }),
});

// Параметры автора
export const authorParamSchema = z.object({
  params: z.object({
    authorId: z.string().min(1, COURSE_MESSAGES.VALIDATION.AUTHOR_REQUIRED),
  }),
});

// Параметры сложности
export const difficultyParamSchema = z.object({
  params: z.object({
    level: z
      .enum(['beginner', 'intermediate', 'advanced'])
      .refine(val => ['beginner', 'intermediate', 'advanced'].includes(val), {
        message: COURSE_MESSAGES.VALIDATION.DIFFICULTY_INVALID,
      }),
  }),
});

// Управление уроками
export const lessonManagementSchema = z.object({
  params: z.object({
    id: z.string().min(1, COURSE_MESSAGES.VALIDATION.COURSE_ID_REQUIRED),
    lessonId: z.string().min(1, COURSE_MESSAGES.VALIDATION.LESSON_ID_REQUIRED),
  }),
});

// Управление доступом пользователей
export const addUserToAllowedSchema = z.object({
  params: z.object({
    id: z.string().min(1, COURSE_MESSAGES.VALIDATION.COURSE_ID_REQUIRED),
  }),
  body: z.object({
    userId: z.string().min(1, COURSE_MESSAGES.VALIDATION.USER_ID_REQUIRED),
  }),
});

export const removeUserFromAllowedSchema = z.object({
  params: z.object({
    id: z.string().min(1, COURSE_MESSAGES.VALIDATION.COURSE_ID_REQUIRED),
    userId: z.string().min(1, COURSE_MESSAGES.VALIDATION.USER_ID_REQUIRED),
  }),
});

// Рейтинги
export const addRatingSchema = z.object({
  params: z.object({
    id: z.string().min(1, COURSE_MESSAGES.VALIDATION.COURSE_ID_REQUIRED),
  }),
  body: z.object({
    value: z.number().min(1, COURSE_MESSAGES.VALIDATION.RATING_MIN).max(5, COURSE_MESSAGES.VALIDATION.RATING_MAX),
  }),
});

// Типы для TypeScript
export type CreateCourseInput = z.infer<typeof createCourseSchema>['body'];
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>['body'];
export type AddUserToAllowedInput = z.infer<typeof addUserToAllowedSchema>['body'];
export type AddRatingInput = z.infer<typeof addRatingSchema>['body'];
export type IdParamInput = z.infer<typeof idParamSchema>['params'];
export type AuthorParamInput = z.infer<typeof authorParamSchema>['params'];
export type DifficultyParamInput = z.infer<typeof difficultyParamSchema>['params'];
export type LessonManagementInput = z.infer<typeof lessonManagementSchema>['params'];
export type RemoveUserFromAllowedInput = z.infer<typeof removeUserFromAllowedSchema>['params'];
