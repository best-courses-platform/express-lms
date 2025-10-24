import { Lesson, NewLesson, UpdateLesson } from "./lesson.types";
import { lessonRepository } from "./lesson.repository";
import { Types } from 'mongoose';
import { AppError } from "../../utils/errors";
import { toObjectIdString, isValidObjectIdString } from "../../utils/typeGuards";

class LessonService {
    async create(input: NewLesson): Promise<Lesson> {
        // Проверяем валидность courseId
        if (!isValidObjectIdString(input.courseId)) {
            throw new AppError(400, "Некорректный ID курса");
        }

        const courseIdString = toObjectIdString(input.courseId);
        const exists = await lessonRepository.findByTitleAndCourse(input.title, courseIdString);

        if (exists) throw new AppError(409, "Урок с таким названием уже существует в этом курсе");

        return lessonRepository.create(input);
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

    async update(id: string, patch: UpdateLesson): Promise<Lesson> {
        if (!isValidObjectIdString(id)) {
            throw new AppError(400, "Некорректный ID урока");
        }

        const lesson = await lessonRepository.findById(id);

        if (!lesson) throw new AppError(404, "Урок не найден");

        // Проверяем уникальность названия при обновлении
        if (patch.title && patch.title !== lesson.title) {
            const courseIdString = toObjectIdString(lesson.courseId);
            const exists = await lessonRepository.findByTitleAndCourse(patch.title, courseIdString);

            if (exists) throw new AppError(409, "Урок с таким названием уже существует в этом курсе");
        }

        return lessonRepository.update(id, patch);
    }

    async delete(id: string): Promise<void> {
        if (!isValidObjectIdString(id)) {
            throw new AppError(400, "Некорректный ID урока");
        }

        const ok = await lessonRepository.delete(id);

        if (!ok) throw new AppError(404, "Урок не найден");
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

        // Простая проверка - пользователь имеет доступ если он в allowedUsers
        const userIdObj = new Types.ObjectId(userId);
        return lesson.allowedUsers.some(allowedUserId => allowedUserId.equals(userIdObj));
    }

    async addUserToAllowed(lessonId: string, userId: string): Promise<Lesson> {
        if (!isValidObjectIdString(lessonId) || !isValidObjectIdString(userId)) {
            throw new AppError(400, "Некорректный ID урока или пользователя");
        }

        const lesson = await lessonRepository.findById(lessonId);
        if (!lesson) throw new AppError(404, "Урок не найден");

        const userIdObj = new Types.ObjectId(userId);

        // Проверяем, не добавлен ли уже пользователь
        if (lesson.allowedUsers.some(id => id.equals(userIdObj))) {
            throw new AppError(409, "Пользователь уже имеет доступ к этому уроку");
        }

        // Добавляем пользователя
        const updatedLesson = await lessonRepository.update(lessonId, {
            allowedUsers: [...lesson.allowedUsers, userIdObj]
        });

        return updatedLesson;
    }
}

export const lessonService = new LessonService();