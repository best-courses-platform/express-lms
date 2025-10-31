import { Types } from 'mongoose';

// Тип ресурса урока (файл, ссылка, видео)
export type LessonResourceType = 'file' | 'link' | 'video';

// Ресурс урока (дополнительные материалы)
export type LessonResource = {
    type: LessonResourceType;
    title: string;
    url?: string;
    description?: string;
    fileSize?: number;
    mimeType?: string;
    originalName?: string;
};

export type VideoFile = {
    url?: string;
    originalName?: string;
    size?: number;
    duration?: number;
    mimeType?: string;
};

// Основной тип урока
export type Lesson = {
    _id: Types.ObjectId;
    title: string;
    description: string;
    courseId: Types.ObjectId; // Ссылка на курс, к которому принадлежит урок
    order: number; // Порядковый номер урока в курсе
    videoFile?: VideoFile; // для загруженных видео через Selectel
    resources?: LessonResource[]; // Дополнительные ресурсы
    inputExamples?: string; // Примеры входных данных
    outputExamples?: string; // Примеры выходных данных
    tags: string[]; // Теги (например, "алгоритмы", "структуры данных")
    createdAt: Date;
    updatedAt: Date;
}

// Тип для создания нового урока (без служебных полей)
export type NewLesson = Omit<Lesson, "_id" | "createdAt" | "updatedAt">;

// Тип для обновления урока
export type UpdateLesson = Partial<NewLesson>;
