// domains/lessons/lesson.controller.ts
import { RequestHandler } from "express";
import { lessonService } from "./lesson.service";
import { courseService } from "courses/course.service";
import { AppError } from "../../utils/errors";
import { isAuthenticatedRequest, getUserIdFromRequest } from "../../utils/typeGuards";
import { fileStorageService } from "file-storage/file-storage.service";
import { validate } from "../../middleware/validate";
import {
    createLessonSchema,
    createLessonForCourseSchema,
    updateLessonSchema,
    idParamSchema,
    courseIdParamSchema,
    accessCheckSchema,
    uploadFileSchema,
    deleteFileSchema,
    deleteResourceSchema
} from "./lesson.schema";
import { LESSON_MESSAGES } from "./lesson.constants";

export const createLessonForCourse: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, LESSON_MESSAGES.ERROR.UNAUTHORIZED);
        }

        const userId = getUserIdFromRequest(req);
        const courseId = req.params.courseId;

        // Проверяем, что пользователь - автор курса
        const course = await courseService.getById(courseId);
        if (!course.author.equals(userId)) {
            throw new AppError(403, LESSON_MESSAGES.ERROR.NOT_AUTHOR);
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

        res.status(201).json({
            success: true,
            message: LESSON_MESSAGES.SUCCESS.LESSON_CREATED,
            data: lesson
        });
    } catch (e) { next(e); }
};

export const createLesson: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, LESSON_MESSAGES.ERROR.UNAUTHORIZED);
        }

        const lesson = await lessonService.create(req.body);
        res.status(201).json({
            success: true,
            message: LESSON_MESSAGES.SUCCESS.LESSON_CREATED,
            data: lesson
        });
    } catch (e) { next(e); }
};

export const listLessons: RequestHandler = async (_req, res, next) => {
    try {
        const lessons = await lessonService.list();
        res.json({
            success: true,
            data: lessons
        });
    } catch (e) { next(e); }
};

export const getLesson: RequestHandler = async (req, res, next) => {
    try {
        const lesson = await lessonService.getById(req.params.id);
        res.json({
            success: true,
            data: lesson
        });
    } catch (e) { next(e); }
};

export const updateLesson: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, LESSON_MESSAGES.ERROR.UNAUTHORIZED);
        }

        const userId = getUserIdFromRequest(req);
        const updated = await lessonService.update(req.params.id, req.body, userId);
        res.json({
            success: true,
            message: LESSON_MESSAGES.SUCCESS.LESSON_UPDATED,
            data: updated
        });
    } catch (e) { next(e); }
};

export const deleteLesson: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, LESSON_MESSAGES.ERROR.UNAUTHORIZED);
        }

        const userId = getUserIdFromRequest(req);
        await lessonService.delete(req.params.id, userId);
        res.status(204).send();
    } catch (e) { next(e); }
};

export const getLessonsByCourse: RequestHandler = async (req, res, next) => {
    try {
        const lessons = await lessonService.getByCourseId(req.params.courseId);
        res.json({
            success: true,
            data: lessons
        });
    } catch (e) { next(e); }
};

export const checkLessonAccess: RequestHandler = async (req, res, next) => {
    try {
        const hasAccess = await lessonService.checkUserAccess(req.params.lessonId, req.params.userId);
        res.json({
            success: true,
            data: { hasAccess },
            message: hasAccess ? LESSON_MESSAGES.SUCCESS.ACCESS_GRANTED : LESSON_MESSAGES.ERROR.ACCESS_DENIED
        });
    } catch (e) { next(e); }
};

export const uploadLessonFile: RequestHandler = async (req, res, next) => {
    try {
        const { lessonId } = req.params;
        const { fileType, title, description } = req.body;
        const userId = req.user?._id;

        if (!req.file) {
            throw new AppError(400, LESSON_MESSAGES.ERROR.FILE_NOT_UPLOADED);
        }

        console.log(LESSON_MESSAGES.LOGS.FILE_RECEIVED, {
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            location: (req.file as any).location,
            key: (req.file as any).key
        });

        // Используем FileStorageService для загрузки файла
        const uploadedFile = await fileStorageService.uploadMulterFile(
            req.file as any,
            lessonId
        );

        console.log(`${LESSON_MESSAGES.LOGS.FILE_PROCESSED} ${uploadedFile.url}`);

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
            message: LESSON_MESSAGES.SUCCESS.FILE_UPLOADED,
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
            throw new AppError(401, LESSON_MESSAGES.ERROR.UNAUTHORIZED);
        }

        const userId = getUserIdFromRequest(req);
        const lessonId = req.params.lessonId;
        const { fileUrl, fileType } = req.body;

        const updatedLesson = await lessonService.deleteFile(
            lessonId,
            fileUrl,
            fileType,
            userId
        );

        res.json({
            success: true,
            message: LESSON_MESSAGES.SUCCESS.FILE_DELETED,
            data: updatedLesson
        });
    } catch (e) { next(e); }
};

export const deleteLessonResource: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, LESSON_MESSAGES.ERROR.UNAUTHORIZED);
        }

        const userId = getUserIdFromRequest(req);
        const lessonId = req.params.lessonId;
        const resourceIndex = parseInt(req.params.resourceIndex);

        if (isNaN(resourceIndex)) {
            throw new AppError(400, LESSON_MESSAGES.VALIDATION.RESOURCE_INDEX_INVALID);
        }

        const updatedLesson = await lessonService.deleteResourceByIndex(
            lessonId,
            resourceIndex,
            userId
        );

        res.json({
            success: true,
            message: LESSON_MESSAGES.SUCCESS.RESOURCE_DELETED,
            data: updatedLesson
        });
    } catch (e) { next(e); }
};

// Экспорт с валидацией для использования в routes
export const LessonController = {
    createLesson: [validate(createLessonSchema), createLesson],
    createLessonForCourse: [validate(createLessonForCourseSchema), createLessonForCourse],
    listLessons,
    getLesson: [validate(idParamSchema), getLesson],
    updateLesson: [validate(updateLessonSchema), updateLesson],
    deleteLesson: [validate(idParamSchema), deleteLesson],
    getLessonsByCourse: [validate(courseIdParamSchema), getLessonsByCourse],
    checkLessonAccess: [validate(accessCheckSchema), checkLessonAccess],
    uploadLessonFile: [validate(uploadFileSchema), uploadLessonFile],
    deleteLessonFile: [validate(deleteFileSchema), deleteLessonFile],
    deleteLessonResource: [validate(deleteResourceSchema), deleteLessonResource]
};