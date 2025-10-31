import {Lesson, LessonResource, NewLesson, UpdateLesson, VideoFile} from "./lesson.types";
import { lessonRepository } from "./lesson.repository";
import { courseService } from "courses/course.service";
import { Types } from 'mongoose';
import { AppError } from "../../utils/errors";
import { toObjectIdString, isValidObjectIdString } from "../../utils/typeGuards";
import {fileStorageService, UploadedFile} from "file-storage/file-storage.service";

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

// lesson.service.ts
    async uploadFile(
        lessonId: string,
        fileData: UploadedFile,
        fileType: 'video' | 'resource',
        title?: string,
        description?: string,
        userId?: Types.ObjectId
    ): Promise<Lesson> {
        const lesson = await this.getById(lessonId);

        if (userId) {
            const course = await courseService.getById(lesson.courseId.toString());
            if (!course.author.equals(userId)) {
                throw new AppError(403, "Только автор курса может загружать файлы");
            }
        }

        if (fileType === 'video') {
            // ДЛЯ ВИДЕО: всегда заменяем существующее видео
            const oldVideoUrl = lesson.videoFile?.url;

            const videoFile: VideoFile = {
                url: fileData.url,
                originalName: fileData.originalName,
                size: fileData.size,
                mimeType: fileData.mimeType
            };

            console.log(`🎥 ${oldVideoUrl ? 'Замена' : 'Добавление'} видео для урока ${lessonId}`);
            console.log(`Новое видео: ${fileData.url}`);
            if (oldVideoUrl) {
                console.log(`Старое видео: ${oldVideoUrl}`);
            }

            const updatedLesson = await lessonRepository.updateVideoFile(lessonId, videoFile);

            // Удаляем старое видео из S3
            if (oldVideoUrl && oldVideoUrl !== fileData.url) {
                try {
                    console.log(`Удаление старого видео: ${oldVideoUrl}`);
                    await fileStorageService.deleteFile(oldVideoUrl);
                    console.log(`Старое видео удалено: ${oldVideoUrl}`);
                } catch (error) {
                    console.error('Ошибка при удалении старого видео:', error);
                    // Продолжаем выполнение даже если удаление не удалось
                }
            }

            return updatedLesson;

        } else {
            // ДЛЯ РЕСУРСОВ: заменяем по названию
            const resourceTitle = title || fileData.originalName;

            // Ищем существующий ресурс с таким же названием
            const existingResourceIndex = (lesson.resources || []).findIndex(
                resource => resource.title === resourceTitle && resource.type === 'file'
            );

            let updatedLesson: Lesson;

            if (existingResourceIndex !== -1) {
                console.log(`Замена существующего ресурса: "${resourceTitle}"`);

                // ЗАМЕНЯЕМ существующий ресурс
                const oldResource = lesson.resources![existingResourceIndex];

                console.log(`Новый ресурс: ${fileData.url}`);
                console.log(`Старый ресурс: ${oldResource.url}`);

                // Удаляем старый файл из S3 (если это другой файл)
                if (oldResource.url && oldResource.url !== fileData.url) {
                    try {
                        console.log(`Удаление старого файла ресурса: ${oldResource.url}`);
                        await fileStorageService.deleteFile(oldResource.url);
                        console.log(`Старый файл ресурса удален: ${oldResource.url}`);
                    } catch (error) {
                        console.error('Ошибка при удалении старого файла ресурса:', error);
                    }
                }

                // Создаем обновленный ресурс
                const updatedResource: LessonResource = {
                    type: 'file',
                    title: resourceTitle,
                    url: fileData.url,
                    description: description || oldResource.description,
                    fileSize: fileData.size,
                    mimeType: fileData.mimeType,
                    originalName: fileData.originalName
                };

                // Заменяем ресурс по индексу
                const updatedResources = [...(lesson.resources || [])];
                updatedResources[existingResourceIndex] = updatedResource;

                updatedLesson = await lessonRepository.update(lessonId, {
                    resources: updatedResources
                });

                console.log(`Ресурс "${resourceTitle}" заменен`);

            } else {
                // ДОБАВЛЯЕМ новый ресурс
                console.log(`Добавление нового ресурса: "${resourceTitle}"`);

                const resource: LessonResource = {
                    type: 'file',
                    title: resourceTitle,
                    url: fileData.url,
                    description,
                    fileSize: fileData.size,
                    mimeType: fileData.mimeType,
                    originalName: fileData.originalName
                };

                updatedLesson = await lessonRepository.addResource(lessonId, resource);
            }

            return updatedLesson;
        }
    }

    async deleteFile(
        lessonId: string,
        fileUrl: string,
        fileType: 'video' | 'resource',
        userId?: Types.ObjectId
    ): Promise<Lesson> {
        const lesson = await this.getById(lessonId);

        if (userId) {
            const course = await courseService.getById(lesson.courseId.toString());
            if (!course.author.equals(userId)) {
                throw new AppError(403, "Только автор курса может удалять файлы");
            }
        }

        // Удаляем файл из Selectel
        await fileStorageService.deleteFile(fileUrl);

        if (fileType === 'video') {
            // Удаляем видео из урока
            return lessonRepository.updateVideoFile(lessonId, undefined);
        } else {
            // Ищем индекс ресурса по URL
            const resourceIndex = (lesson.resources || []).findIndex(
                resource => resource.url === fileUrl
            );

            if (resourceIndex === -1) {
                throw new AppError(404, "Ресурс не найден");
            }

            // ИСПОЛЬЗУЕМ НОВЫЙ МЕТОД РЕПОЗИТОРИЯ
            return lessonRepository.removeResourceByIndex(lessonId, resourceIndex);
        }
    }

    async deleteResourceByIndex(
        lessonId: string,
        resourceIndex: number,
        userId: Types.ObjectId
    ): Promise<Lesson> {
        const lesson = await this.getById(lessonId);

        const course = await courseService.getById(lesson.courseId.toString());
        if (!course.author.equals(userId)) {
            throw new AppError(403, "Только автор курса может удалять ресурсы");
        }

        if (!lesson.resources || resourceIndex >= lesson.resources.length) {
            throw new AppError(404, "Ресурс не найден");
        }

        const resourceToDelete = lesson.resources[resourceIndex];

        // Удаляем файл из Selectel только если есть URL
        if (resourceToDelete.type === 'file' && resourceToDelete.url) {
            try {
                await fileStorageService.deleteFile(resourceToDelete.url);
            } catch (error) {
                console.error('Ошибка при удалении файла из хранилища:', error);
                // Не прерываем выполнение, продолжаем удалять ресурс из БД
            }
        }

        // Используем метод репозитория
        return lessonRepository.removeResourceByIndex(lessonId, resourceIndex);
    }
}

export const lessonService = new LessonService();