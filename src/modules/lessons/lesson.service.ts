// domains/lessons/lesson.service.ts
import { Lesson, LessonResource, NewLesson, VideoFile } from './lesson.types';
import { lessonRepository } from './lesson.repository';
import { courseService } from 'courses/course.service';
import { Types } from 'mongoose';
import { AppError } from '../../utils/errors';
import { isValidObjectIdString, toObjectIdString } from '../../utils/typeGuards';
import { fileStorageService } from 'file-storage/file-storage.service';
import { UploadedFile } from 'file-storage/file-storage.types';
import { CreateLessonInput, UpdateLessonInput } from './lesson.schema';
import { LESSON_MESSAGES } from './lesson.constants';
import { Course } from 'courses/course.types';

class LessonService {
  /**
   * Создание нового урока
   */
  async create(input: CreateLessonInput): Promise<Lesson> {
    if (!isValidObjectIdString(input.courseId)) {
      throw new AppError(400, LESSON_MESSAGES.ERROR.INVALID_COURSE_ID);
    }

    const courseIdString = toObjectIdString(input.courseId);
    await this.validateUniqueLessonTitle(input.title, courseIdString);

    const lessonData: NewLesson = {
      ...input,
      courseId: new Types.ObjectId(input.courseId),
      tags: input.tags || [],
    };

    return lessonRepository.create(lessonData);
  }

  /**
   * Обновление урока
   */
  async update(id: string, patch: UpdateLessonInput, userId: Types.ObjectId): Promise<Lesson> {
    if (!isValidObjectIdString(id)) {
      throw new AppError(400, LESSON_MESSAGES.ERROR.INVALID_LESSON_ID);
    }

    const { lesson } = await this.validateLessonManagementPermissions(id, userId);

    if (patch.title && patch.title !== lesson.title) {
      await this.validateUniqueLessonTitle(patch.title, lesson.courseId.toString());
    }

    return lessonRepository.update(id, patch);
  }

  /**
   * Удаление урока (с очисткой файлов из S3)
   */
  async delete(id: string, userId: Types.ObjectId): Promise<void> {
    if (!isValidObjectIdString(id)) {
      throw new AppError(400, LESSON_MESSAGES.ERROR.INVALID_LESSON_ID);
    }

    const { course } = await this.validateLessonManagementPermissions(id, userId);

    // Очищаем файлы из S3
    await this.cleanupLessonFiles(id);

    // Удаляем урок из БД
    const ok = await lessonRepository.delete(id);
    if (!ok) {
      throw new AppError(404, LESSON_MESSAGES.ERROR.NOT_FOUND);
    }

    // Удаляем урок из курса
    await courseService.removeLesson(course._id.toString(), id, userId);

    console.log(`Урок ${id} полностью удален (БД + S3)`);
  }

  /**
   * Получение следующего порядкового номера для урока в курсе
   */
  async getNextOrderNumber(courseId: string): Promise<number> {
    return lessonRepository.getNextOrderNumber(courseId);
  }

  /**
   * Получение списка всех уроков
   */
  async list(): Promise<Lesson[]> {
    return lessonRepository.findAll();
  }

  /**
   * Получение урока по ID
   */
  async getById(id: string): Promise<Lesson> {
    if (!isValidObjectIdString(id)) {
      throw new AppError(400, LESSON_MESSAGES.ERROR.INVALID_LESSON_ID);
    }

    const lesson = await lessonRepository.findById(id);
    if (!lesson) {
      throw new AppError(404, LESSON_MESSAGES.ERROR.NOT_FOUND);
    }

    return lesson;
  }

  /**
   * Получение уроков по ID курса
   */
  async getByCourseId(courseId: string): Promise<Lesson[]> {
    if (!isValidObjectIdString(courseId)) {
      throw new AppError(400, LESSON_MESSAGES.ERROR.INVALID_COURSE_ID);
    }

    return lessonRepository.findByCourseId(courseId);
  }

  /**
   * Проверка доступа пользователя к уроку
   */
  async checkUserAccess(lessonId: string, userId: string): Promise<boolean> {
    if (!isValidObjectIdString(lessonId) || !isValidObjectIdString(userId)) {
      return false;
    }

    const lesson = await lessonRepository.findById(lessonId);
    if (!lesson) {
      return false;
    }

    // Проверяем доступ через родительский курс
    const course = await courseService.getById(lesson.courseId.toString());
    const userIdObj = new Types.ObjectId(userId);

    // Доступ есть у:
    // 1. Автора курса
    // 2. Пользователей из allowedUsers курса
    // 3. Если курс опубликован - доступ у всех (по логике задания)
    const isAuthor = course.author.equals(userIdObj);
    const isAllowedUser = course.allowedUsers?.some(allowedUserId => allowedUserId.equals(userIdObj)) || false;
    const isCoursePublished = course.isPublished;

    return isAuthor || isAllowedUser || isCoursePublished;
  }

  /**
   * Загрузка файла для урока
   */
  async uploadFile(
    lessonId: string,
    fileData: UploadedFile,
    fileType: 'video' | 'resource',
    title?: string,
    description?: string,
    userId?: Types.ObjectId
  ): Promise<Lesson> {
    const lesson = await this.getById(lessonId);

    // Проверка прав
    await this.validateFileUploadPermissions(lesson, userId);

    if (fileType === 'video') {
      return await this.handleVideoUpload(lessonId, lesson, fileData);
    } else {
      return await this.handleResourceUpload(lessonId, lesson, fileData, title, description);
    }
  }

  /**
   * Удаление файла урока
   */
  async deleteFile(
    lessonId: string,
    fileUrl: string,
    fileType: 'video' | 'resource',
    userId?: Types.ObjectId
  ): Promise<Lesson> {
    const { lesson } = await this.validateLessonManagementPermissions(lessonId, userId!);

    // Удаляем файл из хранилища
    await fileStorageService.deleteFile(fileUrl);

    if (fileType === 'video') {
      // Удаляем видео из урока
      return lessonRepository.updateVideoFile(lessonId, undefined);
    } else {
      // Ищем индекс ресурса по URL
      const resourceIndex = this.findResourceIndexByUrl(lesson, fileUrl);

      if (resourceIndex === -1) {
        throw new AppError(404, LESSON_MESSAGES.ERROR.RESOURCE_NOT_FOUND);
      }

      return lessonRepository.removeResourceByIndex(lessonId, resourceIndex);
    }
  }

  /**
   * Удаление ресурса урока по индексу
   */
  async deleteResourceByIndex(lessonId: string, resourceIndex: number, userId: Types.ObjectId): Promise<Lesson> {
    // Проверяем права одним вызовом
    const { lesson } = await this.validateLessonManagementPermissions(lessonId, userId);

    // Проверяем существование ресурса
    const resourceToDelete = this.validateResourceExists(lesson, resourceIndex);

    // Удаляем файл из хранилища
    await this.safelyDeleteResourceFile(resourceToDelete);

    // Удаляем ресурс из БД
    return lessonRepository.removeResourceByIndex(lessonId, resourceIndex);
  }

  // ==================== ПРИВАТНЫЕ МЕТОДЫ ====================

  /**
   * Проверка прав пользователя на управление уроком
   */
  private async validateLessonManagementPermissions(
    lessonId: string,
    userId: Types.ObjectId
  ): Promise<{ lesson: Lesson; course: Course }> {
    // Заменяем any на Course
    const lesson = await this.getById(lessonId);
    const course = await courseService.getById(lesson.courseId.toString());

    if (!course.author.equals(userId)) {
      throw new AppError(403, LESSON_MESSAGES.ERROR.NOT_AUTHOR);
    }

    return { lesson, course };
  }

  /**
   * Проверка прав на загрузку файлов
   */
  private async validateFileUploadPermissions(lesson: Lesson, userId?: Types.ObjectId): Promise<void> {
    if (!userId) {
      return;
    }

    const course = await courseService.getById(lesson.courseId.toString());
    if (!course.author.equals(userId)) {
      throw new AppError(403, LESSON_MESSAGES.ERROR.NOT_AUTHOR);
    }
  }

  /**
   * Проверка уникальности названия урока в курсе
   */
  private async validateUniqueLessonTitle(title: string, courseId: string): Promise<void> {
    const exists = await lessonRepository.findByTitleAndCourse(title, courseId);
    if (exists) {
      throw new AppError(409, LESSON_MESSAGES.ERROR.ALREADY_EXISTS);
    }
  }

  /**
   * Проверка существования ресурса по индексу
   */
  private validateResourceExists(lesson: Lesson, resourceIndex: number): LessonResource {
    if (!lesson.resources || resourceIndex >= lesson.resources.length) {
      throw new AppError(404, LESSON_MESSAGES.ERROR.RESOURCE_NOT_FOUND);
    }

    return lesson.resources[resourceIndex];
  }

  /**
   * Поиск индекса ресурса по URL
   */
  private findResourceIndexByUrl(lesson: Lesson, fileUrl: string): number {
    return (lesson.resources || []).findIndex(resource => resource.url === fileUrl);
  }

  /**
   * Удаление файла ресурса из хранилища (с безопасной обработкой ошибок)
   */
  private async safelyDeleteResourceFile(resource: LessonResource): Promise<void> {
    if (resource.type === 'file' && resource.url) {
      try {
        console.log(`${LESSON_MESSAGES.LOGS.RESOURCE_FILE_DELETED} ${resource.url}`);
        await fileStorageService.deleteFile(resource.url);
        console.log(`${LESSON_MESSAGES.LOGS.RESOURCE_FILE_DELETED} ${resource.url}`);
      } catch (error) {
        console.error(LESSON_MESSAGES.LOGS.RESOURCE_DELETE_ERROR, error);
        // Не прерываем выполнение - продолжаем удаление из БД
      }
    }
  }

  /**
   * Очистка файлов урока из S3
   */
  private async cleanupLessonFiles(lessonId: string): Promise<void> {
    console.log(`${LESSON_MESSAGES.LOGS.CLEANUP_STARTED} ${lessonId}`);
    try {
      await fileStorageService.deleteLessonFolder(lessonId);
      console.log(`${LESSON_MESSAGES.LOGS.CLEANUP_COMPLETED} ${lessonId}`);
    } catch (error) {
      console.error(`${LESSON_MESSAGES.LOGS.CLEANUP_ERROR} ${lessonId}:`, error);
    }
  }

  /**
   * Обработка загрузки видео
   */
  private async handleVideoUpload(lessonId: string, lesson: Lesson, fileData: UploadedFile): Promise<Lesson> {
    const oldVideoUrl = lesson.videoFile?.url;

    console.log(
      `🎥 ${oldVideoUrl ? LESSON_MESSAGES.LOGS.VIDEO_REPLACED : LESSON_MESSAGES.LOGS.VIDEO_ADDED} ${lessonId}`
    );
    console.log(`Новое видео: ${fileData.url}`);

    if (oldVideoUrl) {
      console.log(`Старое видео: ${oldVideoUrl}`);
      await this.deleteOldVideoFile(oldVideoUrl, fileData.url);
    }

    const videoFile = this.createVideoFile(fileData);
    return await lessonRepository.updateVideoFile(lessonId, videoFile);
  }

  /**
   * Удаление старого видео файла
   */
  private async deleteOldVideoFile(oldVideoUrl: string, newVideoUrl: string): Promise<void> {
    if (oldVideoUrl === newVideoUrl) {
      return;
    }

    try {
      console.log(`${LESSON_MESSAGES.LOGS.OLD_VIDEO_DELETED} ${oldVideoUrl}`);
      await fileStorageService.deleteFile(oldVideoUrl);
      console.log(`${LESSON_MESSAGES.LOGS.OLD_VIDEO_DELETED} ${oldVideoUrl}`);
    } catch (error) {
      console.error(LESSON_MESSAGES.LOGS.OLD_VIDEO_DELETE_ERROR, error);
    }
  }

  /**
   * Создание объекта видео файла
   */
  private createVideoFile(fileData: UploadedFile): VideoFile {
    return {
      url: fileData.url,
      originalName: fileData.originalName,
      size: fileData.size,
      mimeType: fileData.mimeType,
    };
  }

  /**
   * Обработка загрузки ресурса
   */
  private async handleResourceUpload(
    lessonId: string,
    lesson: Lesson,
    fileData: UploadedFile,
    title?: string,
    description?: string
  ): Promise<Lesson> {
    const resourceTitle = title || fileData.originalName;
    const existingResourceIndex = this.findExistingResourceIndex(lesson, resourceTitle);

    if (existingResourceIndex !== -1) {
      return await this.replaceExistingResource(
        lessonId,
        lesson,
        existingResourceIndex,
        fileData,
        resourceTitle,
        description
      );
    } else {
      return await this.addNewResource(lessonId, fileData, resourceTitle, description);
    }
  }

  /**
   * Поиск существующего ресурса по названию
   */
  private findExistingResourceIndex(lesson: Lesson, resourceTitle: string): number {
    return (lesson.resources || []).findIndex(resource => resource.title === resourceTitle && resource.type === 'file');
  }

  /**
   * Замена существующего ресурса
   */
  private async replaceExistingResource(
    lessonId: string,
    lesson: Lesson,
    existingIndex: number,
    fileData: UploadedFile,
    title: string,
    description?: string
  ): Promise<Lesson> {
    console.log(`${LESSON_MESSAGES.LOGS.RESOURCE_REPLACED} "${title}"`);

    const oldResource = lesson.resources![existingIndex];

    await this.deleteOldResourceFile(oldResource, fileData.url);

    const updatedResource = this.createUpdatedResource(oldResource, fileData, title, description);
    const updatedResources = this.replaceResourceInArray(lesson.resources!, existingIndex, updatedResource);

    return await lessonRepository.update(lessonId, { resources: updatedResources });
  }

  /**
   * Удаление старого файла ресурса
   */
  private async deleteOldResourceFile(oldResource: LessonResource, newFileUrl: string): Promise<void> {
    if (!oldResource.url || oldResource.url === newFileUrl) {
      return;
    }

    try {
      console.log(`${LESSON_MESSAGES.LOGS.OLD_RESOURCE_DELETED} ${oldResource.url}`);
      await fileStorageService.deleteFile(oldResource.url);
      console.log(`${LESSON_MESSAGES.LOGS.OLD_RESOURCE_DELETED} ${oldResource.url}`);
    } catch (error) {
      console.error(LESSON_MESSAGES.LOGS.OLD_RESOURCE_DELETE_ERROR, error);
    }
  }

  /**
   * Создание обновленного ресурса
   */
  private createUpdatedResource(
    oldResource: LessonResource,
    fileData: UploadedFile,
    title: string,
    description?: string
  ): LessonResource {
    return {
      type: 'file',
      title,
      url: fileData.url,
      description: description || oldResource.description,
      fileSize: fileData.size,
      mimeType: fileData.mimeType,
      originalName: fileData.originalName,
    };
  }

  /**
   * Замена ресурса в массиве
   */
  private replaceResourceInArray(
    resources: LessonResource[],
    index: number,
    newResource: LessonResource
  ): LessonResource[] {
    const updated = [...resources];
    updated[index] = newResource;
    return updated;
  }

  /**
   * Добавление нового ресурса
   */
  private async addNewResource(
    lessonId: string,
    fileData: UploadedFile,
    title: string,
    description?: string
  ): Promise<Lesson> {
    console.log(`${LESSON_MESSAGES.LOGS.RESOURCE_ADDED} "${title}"`);

    const resource = this.createNewResource(fileData, title, description);
    return await lessonRepository.addResource(lessonId, resource);
  }

  /**
   * Создание нового ресурса
   */
  private createNewResource(fileData: UploadedFile, title: string, description?: string): LessonResource {
    return {
      type: 'file',
      title,
      url: fileData.url,
      description,
      fileSize: fileData.size,
      mimeType: fileData.mimeType,
      originalName: fileData.originalName,
    };
  }
}

export const lessonService = new LessonService();
