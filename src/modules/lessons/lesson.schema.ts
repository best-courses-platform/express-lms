import { z } from 'zod';
import { LESSON_MESSAGES } from './lesson.constants';

// Поля без .default() — единственный источник правил валидации. updateLessonSchema
// строится из этой схемы напрямую (не из lessonBaseSchema), иначе .partial() не спасает:
// Zod применяет .default() к отсутствующему в PATCH-теле полю независимо от внешней
// .optional()-обёртки, которую добавляет .partial() — order/tags тихо сбрасывались бы
// на 1/[] при PATCH, не трогающем эти поля (см. симметричный фикс в course.schema.ts).
const lessonFieldsSchema = z.object({
  title: z
    .string()
    .min(1, LESSON_MESSAGES.VALIDATION.TITLE_REQUIRED)
    .max(100, LESSON_MESSAGES.VALIDATION.TITLE_TOO_LONG),
  description: z
    .string()
    .min(10, LESSON_MESSAGES.VALIDATION.DESCRIPTION_TOO_SHORT)
    .max(2000, LESSON_MESSAGES.VALIDATION.DESCRIPTION_TOO_LONG),
  order: z.number().int('Порядковый номер должен быть целым числом').min(1, LESSON_MESSAGES.VALIDATION.ORDER_MIN),
  tags: z
    .array(z.string().max(30, LESSON_MESSAGES.VALIDATION.TAG_TOO_LONG))
    .max(10, LESSON_MESSAGES.VALIDATION.TAGS_TOO_MANY),
});

// Базовая схема для создания — те же поля, но с дефолтами.
export const lessonBaseSchema = lessonFieldsSchema.extend({
  order: lessonFieldsSchema.shape.order.default(1),
  tags: lessonFieldsSchema.shape.tags.default([]),
});

// Загрузка файлов
export const uploadFileSchema = z.object({
  params: z.object({
    lessonId: z.string().min(1, LESSON_MESSAGES.VALIDATION.LESSON_ID_REQUIRED),
  }),
  body: z.object({
    fileType: z
      .enum(['video', 'resource'])
      .refine(val => ['video', 'resource'].includes(val), { message: LESSON_MESSAGES.VALIDATION.FILE_TYPE_INVALID }),
    title: z
      .string()
      .min(1, LESSON_MESSAGES.VALIDATION.FILE_TITLE_REQUIRED)
      .max(100, LESSON_MESSAGES.VALIDATION.FILE_TITLE_TOO_LONG)
      .optional(),
    description: z.string().max(500, LESSON_MESSAGES.VALIDATION.FILE_DESCRIPTION_TOO_LONG).optional(),
  }),
});

// Удаление файла
export const deleteFileSchema = z.object({
  params: z.object({
    lessonId: z.string().min(1, LESSON_MESSAGES.VALIDATION.LESSON_ID_REQUIRED),
  }),
  body: z.object({
    fileUrl: z.string().min(1, LESSON_MESSAGES.VALIDATION.FILE_URL_REQUIRED),
    fileType: z
      .enum(['video', 'resource'])
      .refine(val => ['video', 'resource'].includes(val), { message: LESSON_MESSAGES.VALIDATION.FILE_TYPE_INVALID }),
  }),
});

// Создание урока
export const createLessonSchema = z.object({
  body: lessonBaseSchema.extend({
    courseId: z.string().min(1, LESSON_MESSAGES.VALIDATION.COURSE_ID_REQUIRED),
  }),
});

// Создание урока для курса (через параметры)
export const createLessonForCourseSchema = z.object({
  params: z.object({
    courseId: z.string().min(1, LESSON_MESSAGES.VALIDATION.COURSE_ID_REQUIRED),
  }),
  body: lessonBaseSchema.omit({ order: true }), // order генерируется автоматически
});

// Обновление урока — lessonFieldsSchema (без .default()), не lessonBaseSchema, см.
// комментарий выше про Zod .partial() + .default().
export const updateLessonSchema = z.object({
  params: z.object({
    id: z.string().min(1, LESSON_MESSAGES.VALIDATION.LESSON_ID_REQUIRED),
  }),
  body: lessonFieldsSchema.partial().refine(data => Object.keys(data).length > 0, {
    message: LESSON_MESSAGES.VALIDATION.AT_LEAST_ONE_FIELD,
  }),
});

// ID параметр
export const idParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, LESSON_MESSAGES.VALIDATION.LESSON_ID_REQUIRED),
  }),
});

// Параметры курса
export const courseIdParamSchema = z.object({
  params: z.object({
    courseId: z.string().min(1, LESSON_MESSAGES.VALIDATION.COURSE_ID_REQUIRED),
  }),
});

// Проверка доступа
export const accessCheckSchema = z.object({
  params: z.object({
    lessonId: z.string().min(1, LESSON_MESSAGES.VALIDATION.LESSON_ID_REQUIRED),
    userId: z.string().min(1, LESSON_MESSAGES.VALIDATION.USER_ID_REQUIRED),
  }),
});

// Удаление ресурса по индексу
export const deleteResourceSchema = z.object({
  params: z.object({
    lessonId: z.string().min(1, LESSON_MESSAGES.VALIDATION.LESSON_ID_REQUIRED),
    resourceIndex: z.string().regex(/^\d+$/, LESSON_MESSAGES.VALIDATION.RESOURCE_INDEX_INVALID),
  }),
});

// Схемы для ресурсов (внутреннее использование)
export const lessonResourceSchema = z.object({
  type: z
    .enum(['file', 'link', 'video'])
    .refine(val => ['file', 'link', 'video'].includes(val), {
      message: 'Тип ресурса должен быть file, link или video',
    }),
  title: z.string().min(1).max(100),
  url: z.string().url().optional(),
  description: z.string().max(500).optional(),
  fileSize: z.number().int().min(0).optional(),
  mimeType: z.string().optional(),
  originalName: z.string().optional(),
});

export const videoFileSchema = z.object({
  url: z.string().url().optional(),
  originalName: z.string().optional(),
  size: z.number().int().min(0).optional(),
  duration: z.number().min(0).optional(),
  mimeType: z.string().optional(),
});

// Типы для TypeScript (остаются без изменений)
export type CreateLessonInput = z.infer<typeof createLessonSchema>['body'];
export type CreateLessonForCourseInput = z.infer<typeof createLessonForCourseSchema>['body'];
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>['body'];
export type UploadFileInput = z.infer<typeof uploadFileSchema>['body'];
export type DeleteFileInput = z.infer<typeof deleteFileSchema>['body'];
export type IdParamInput = z.infer<typeof idParamSchema>['params'];
export type CourseIdParamInput = z.infer<typeof courseIdParamSchema>['params'];
export type AccessCheckInput = z.infer<typeof accessCheckSchema>['params'];
export type DeleteResourceInput = z.infer<typeof deleteResourceSchema>['params'];
export type LessonResource = z.infer<typeof lessonResourceSchema>;
export type VideoFile = z.infer<typeof videoFileSchema>;
