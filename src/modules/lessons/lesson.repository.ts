import { randomUUID } from "crypto";
import { Lesson, NewLesson, UpdateLesson } from "./lesson.types";
import { toObjectIdString } from "../../utils/typeGuards";

const createStubLesson = (overrides?: Partial<Lesson>): Lesson => ({
    _id: randomUUID() as string,
    title: "Пример урока",
    description: "Описание примера урока",
    courseId: randomUUID() as any,
    order: 1,
    videoUrl: "https://example.com/video.mp4",
    resources: [
        {
            type: "file",
            title: "Презентация",
            url: "https://example.com/slides.pdf",
            description: "Слайды урока"
        }
    ],
    inputExamples: "Пример входных данных",
    outputExamples: "Пример выходных данных",
    tags: ["алгоритмы", "программирование"],
    allowedUsers: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
} as Lesson);

class LessonRepository {
    async create(input: NewLesson): Promise<Lesson> {
        return createStubLesson(input);
    }

    async findAll(): Promise<Lesson[]> {
        return [createStubLesson()];
    }

    async findById(id: string): Promise<Lesson | null> {
        // В реальной реализации здесь будет поиск по БД
        return createStubLesson();
    }

    async findByTitleAndCourse(title: string, courseId: string): Promise<Lesson | null> {
        // В реальной реализации здесь будет поиск по БД
        return null;
    }

    async findByCourseId(courseId: string): Promise<Lesson[]> {
        // В реальной реализации здесь будет поиск по БД
        return [createStubLesson({ courseId: courseId as any })];
    }

    async update(id: string, patch: UpdateLesson): Promise<Lesson> {
        return createStubLesson(patch);
    }

    async delete(id: string): Promise<boolean> {
        return true;
    }
}

export const lessonRepository = new LessonRepository();