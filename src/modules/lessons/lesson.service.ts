import { Lesson, NewLesson, UpdateLesson } from "./lesson.types";
import { lessonRepository } from "./lesson.repository";
import { courseService } from "courses/course.service";
import { Types } from 'mongoose';
import { AppError } from "../../utils/errors";
import { toObjectIdString, isValidObjectIdString } from "../../utils/typeGuards";

class LessonService {
    async create(input: NewLesson): Promise<Lesson> {
        if (!isValidObjectIdString(input.courseId)) {
            throw new AppError(400, "Некорректный ID курса");
        }

        const courseIdString = toObjectIdString(input.courseId);
        const exists = await lessonRepository.findByTitleAndCourse(input.title, courseIdString);

        if (exists) throw new AppError(409, "Урок с таким названием уже существует в этом курсе");

        return lessonRepository.create(input);
    }

    async update(id: string, patch: UpdateLesson, userId: Types.ObjectId): Promise<Lesson> {
        if (!isValidObjectIdString(id)) {
            throw new AppError(400, "Некорректный ID урока");
        }

        const lesson = await lessonRepository.findById(id);
        if (!lesson) throw new AppError(404, "Урок не найден");

        // Проверяем, что пользователь - автор курса
        const course = await courseService.getById(lesson.courseId.toString());
        if (!course.author.equals(userId)) {
            throw new AppError(403, "Только автор курса может редактировать уроки");
        }

        // Проверяем уникальность названия при обновлении
        if (patch.title && patch.title !== lesson.title) {
            const courseIdString = toObjectIdString(lesson.courseId);
            const exists = await lessonRepository.findByTitleAndCourse(patch.title, courseIdString);

            if (exists) throw new AppError(409, "Урок с таким названием уже существует в этом курсе");
        }

        return lessonRepository.update(id, patch);
    }

    async delete(id: string, userId: Types.ObjectId): Promise<void> {
        if (!isValidObjectIdString(id)) {
            throw new AppError(400, "Некорректный ID урока");
        }

        const lesson = await lessonRepository.findById(id);
        if (!lesson) throw new AppError(404, "Урок не найден");

        // Проверяем, что пользователь - автор курса
        const course = await courseService.getById(lesson.courseId.toString());
        if (!course.author.equals(userId)) {
            throw new AppError(403, "Только автор курса может удалять уроки");
        }

        const ok = await lessonRepository.delete(id);
        if (!ok) throw new AppError(404, "Урок не найден");

        // Удаляем урок из курса
        await courseService.removeLesson(course._id.toString(), id, userId);
    }

    async getNextOrderNumber(courseId: string): Promise<number> {
        return lessonRepository.getNextOrderNumber(courseId);
    }

    async list(): Promise<Lesson[]> {
        return lessonRepository.findAll();
    }

    async getById(id: string): Promise<Lesson> {
        if (!isValidObjectIdString(id)) {
            throw new AppError(400, "Некорректный ID урока");
        }

        const lesson = await lessonRepository.findById(id);
        if (!lesson) throw new AppError(404, "Урок не найден");

        return lesson;
    }

    async getByCourseId(courseId: string): Promise<Lesson[]> {
        if (!isValidObjectIdString(courseId)) {
            throw new AppError(400, "Некорректный ID курса");
        }

        return lessonRepository.findByCourseId(courseId);
    }

    async checkUserAccess(lessonId: string, userId: string): Promise<boolean> {
        if (!isValidObjectIdString(lessonId) || !isValidObjectIdString(userId)) {
            return false;
        }

        const lesson = await lessonRepository.findById(lessonId);
        if (!lesson) return false;

        // Проверяем доступ через родительский курс
        const course = await courseService.getById(lesson.courseId.toString());
        const userIdObj = new Types.ObjectId(userId);

        // Доступ есть у:
        // 1. Автора курса
        // 2. Пользователей из allowedUsers курса
        // 3. Если курс опубликован - доступ у всех (по логике задания)
        const isAuthor = course.author.equals(userIdObj);
        const isAllowedUser = course.allowedUsers?.some(allowedUserId =>
            allowedUserId.equals(userIdObj)
        ) || false;
        const isCoursePublished = course.isPublished;

        return isAuthor || isAllowedUser || isCoursePublished;
    }
}

export const lessonService = new LessonService();