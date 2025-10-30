import { Types } from 'mongoose';

// Тип ресурса урока (файл, ссылка, видео)
export type LessonResourceType = 'file' | 'link' | 'video';

// Ресурс урока (дополнительные материалы)
export type LessonResource = {
    type: LessonResourceType;
    title: string;
    url: string; // URL файла, видео или ссылки
    description?: string;
};

// Основной тип урока
export type Lesson = {
    _id: Types.ObjectId;
    title: string;
    description: string;
    courseId: Types.ObjectId; // Ссылка на курс, к которому принадлежит урок
    order: number; // Порядковый номер урока в курсе
    videoUrl?: string; // URL видео (если есть)
    resources?: LessonResource[]; // Дополнительные ресурсы
    inputExamples?: string; // Примеры входных данных
    outputExamples?: string; // Примеры выходных данных
    tags: string[]; // Теги (например, "алгоритмы", "структуры данных")
    allowedUsers: Types.ObjectId[]; // Пользователи с доступом к уроку
    createdAt: Date;
    updatedAt: Date;
}

// Тип для создания нового урока (без служебных полей)
export type NewLesson = Omit<Lesson, "createdAt" | "updatedAt">;

// Тип для обновления урока
export type UpdateLesson = Partial<NewLesson>;
