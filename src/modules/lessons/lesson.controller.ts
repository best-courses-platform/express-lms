import { RequestHandler } from "express";
import { lessonService } from "./lesson.service";
import { courseService } from "courses/course.service";
import { AppError } from "../../utils/errors";
import { isAuthenticatedRequest, getUserIdFromRequest } from "../../utils/typeGuards";
import { fileStorageService } from "file-storage/file-storage.service";

export const createLessonForCourse: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Требуется авторизация");
        }

        const userId = getUserIdFromRequest(req);
        const courseId = req.params.courseId;

        // Проверяем, что пользователь - автор курса
        const course = await courseService.getById(courseId);
        if (!course.author.equals(userId)) {
            throw new AppError(403, "Только автор курса может добавлять уроки");
        }

        // Автоматически определяем порядковый номер
        const order = await lessonService.getNextOrderNumber(courseId);

        const lessonData = {
            ...req.body,
            courseId,
            order
        };

        const lesson = await lessonService.create(lessonData);

        // Автоматически добавляем урок в курс
        await courseService.addLesson(courseId, lesson._id.toString(), userId);

        res.status(201).json(lesson);
    } catch (e) { next(e); }
};

export const createLesson: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Требуется авторизация");
        }

        const lesson = await lessonService.create(req.body);
        res.status(201).json(lesson);
    } catch (e) { next(e); }
};

// Остальные методы остаются без изменений...
export const listLessons: RequestHandler = async (_req, res, next) => {
    try {
        const lessons = await lessonService.list();
        res.json(lessons);
    } catch (e) { next(e); }
};

export const getLesson: RequestHandler = async (req, res, next) => {
    try {
        const lesson = await lessonService.getById(req.params.id);
        res.json(lesson);
    } catch (e) { next(e); }
};

export const updateLesson: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Требуется авторизация");
        }

        const userId = getUserIdFromRequest(req);
        const updated = await lessonService.update(req.params.id, req.body, userId);
        res.json(updated);
    } catch (e) { next(e); }
};

export const deleteLesson: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Требуется авторизация");
        }

        const userId = getUserIdFromRequest(req);
        await lessonService.delete(req.params.id, userId);
        res.status(204).send();
    } catch (e) { next(e); }
};

export const getLessonsByCourse: RequestHandler = async (req, res, next) => {
    try {
        const lessons = await lessonService.getByCourseId(req.params.courseId);
        res.json(lessons);
    } catch (e) { next(e); }
};

export const checkLessonAccess: RequestHandler = async (req, res, next) => {
    try {
        const hasAccess = await lessonService.checkUserAccess(req.params.lessonId, req.params.userId);
        res.json({ hasAccess });
    } catch (e) { next(e); }
};

// lesson.controller.ts
export const uploadLessonFile: RequestHandler = async (req, res, next) => {
    try {
        const { lessonId } = req.params;
        const { fileType, title, description } = req.body;
        const userId = req.user?._id;

        if (!fileType || !['video', 'resource'].includes(fileType)) {
            throw new AppError(400, "fileType должен быть 'video' или 'resource'");
        }

        if (!req.file) {
            throw new AppError(400, "Файл не загружен");
        }

        console.log('Получен файл через multer:', {
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            location: (req.file as any).location,
            key: (req.file as any).key
        });

        // Используем FileStorageService для загрузки файла
        const uploadedFile = await fileStorageService.uploadMulterFile(
            req.file as any, // Приводим к правильному типу
            lessonId
        );

        console.log(`Файл обработан: ${uploadedFile.url}`);

        const result = await lessonService.uploadFile(
            lessonId,
            uploadedFile,
            fileType,
            title,
            description,
            userId
        );

        res.json({
            success: true,
            message: 'Файл успешно загружен',
            data: result,
            fileUrl: uploadedFile.url
        });
    } catch (e) {
        console.error('Ошибка при загрузке файла:', e);
        next(e);
    }
};

export const deleteLessonFile: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Требуется авторизация");
        }

        const userId = getUserIdFromRequest(req);
        const lessonId = req.params.lessonId;
        const fileUrl = req.body.fileUrl;
        const fileType = req.body.fileType as 'video' | 'resource';

        const updatedLesson = await lessonService.deleteFile(
            lessonId,
            fileUrl,
            fileType,
            userId
        );

        res.json(updatedLesson);
    } catch (e) { next(e); }
};

export const deleteLessonResource: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, "Требуется авторизация");
        }

        const userId = getUserIdFromRequest(req);
        const lessonId = req.params.lessonId;
        const resourceIndex = parseInt(req.params.resourceIndex);

        if (isNaN(resourceIndex)) {
            throw new AppError(400, "Некорректный индекс ресурса");
        }

        const updatedLesson = await lessonService.deleteResourceByIndex(
            lessonId,
            resourceIndex,
            userId
        );

        res.json(updatedLesson);
    } catch (e) { next(e); }
};