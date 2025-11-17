// domains/courses/course.controller.ts
import { RequestHandler } from "express";
import { courseService } from "./course.service";
import { AppError } from "../../utils/errors";
import { isAuthenticatedRequest, getUserIdFromRequest } from "../../utils/typeGuards";
import { Types } from 'mongoose';
import { validate } from "../../middleware/validate";
import {
    createCourseSchema,
    updateCourseSchema,
    idParamSchema,
    authorParamSchema,
    difficultyParamSchema,
    lessonManagementSchema,
    addUserToAllowedSchema,
    removeUserFromAllowedSchema,
    addRatingSchema
} from "./course.schema";
import { COURSE_MESSAGES } from "./course.constants";

export const createCourse: RequestHandler = async (req, res, next) => {
    try {
        const course = await courseService.create(req.body);
        res.status(201).json({
            message: COURSE_MESSAGES.SUCCESS.COURSE_CREATED,
            course
        });
    } catch (e) { next(e); }
};

export const listCourse: RequestHandler = async (_req, res, next) => {
    try {
        const courses = await courseService.list();
        res.json(courses);
    } catch (e) { next(e); }
};

export const getPublishedCourses: RequestHandler = async (_req, res, next) => {
    try {
        const courses = await courseService.getPublishedCourses();
        res.json(courses);
    } catch (e) { next(e); }
};

export const getCoursesByAuthor: RequestHandler = async (req, res, next) => {
    try {
        const courses = await courseService.getCoursesByAuthor(req.params.authorId);
        res.json(courses);
    } catch (e) { next(e); }
};

export const getCoursesByDifficulty: RequestHandler = async (req, res, next) => {
    try {
        const courses = await courseService.getCoursesByDifficulty(req.params.level);
        res.json(courses);
    } catch (e) { next(e); }
};

export const getCourse: RequestHandler = async (req, res, next) => {
    try {
        const course = await courseService.getById(req.params.id);
        res.json(course);
    } catch (e) { next(e); }
};

export const updateCourse: RequestHandler = async (req, res, next) => {
    try {
        const updated = await courseService.update(req.params.id, req.body);
        res.json({
            message: COURSE_MESSAGES.SUCCESS.COURSE_UPDATED,
            course: updated
        });
    } catch (e) { next(e); }
};

export const deleteCourse: RequestHandler = async (req, res, next) => {
    try {
        await courseService.delete(req.params.id);
        res.json({ message: COURSE_MESSAGES.SUCCESS.COURSE_DELETED });
    } catch (e) { next(e); }
};

export const addLesson: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, COURSE_MESSAGES.ERROR.UNAUTHORIZED);
        }
        const userId = getUserIdFromRequest(req);
        const updated = await courseService.addLesson(
            req.params.id,
            req.params.lessonId,
            userId
        );
        res.json({
            message: COURSE_MESSAGES.SUCCESS.LESSON_ADDED,
            course: updated
        });
    } catch (e) { next(e); }
};

export const removeLesson: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, COURSE_MESSAGES.ERROR.UNAUTHORIZED);
        }
        const userId = getUserIdFromRequest(req);
        const updated = await courseService.removeLesson(
            req.params.id,
            req.params.lessonId,
            userId
        );
        res.json({
            message: COURSE_MESSAGES.SUCCESS.LESSON_REMOVED,
            course: updated
        });
    } catch (e) { next(e); }
};

export const addUserToAllowed: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, COURSE_MESSAGES.ERROR.UNAUTHORIZED);
        }
        const userId = getUserIdFromRequest(req);
        const updated = await courseService.addUserToAllowed(
            req.params.id,
            new Types.ObjectId(req.body.userId),
            userId
        );
        res.json({
            message: COURSE_MESSAGES.SUCCESS.USER_ADDED_TO_ALLOWED,
            course: updated
        });
    } catch (e) { next(e); }
};

export const removeUserFromAllowed: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, COURSE_MESSAGES.ERROR.UNAUTHORIZED);
        }
        const userId = getUserIdFromRequest(req);
        const updated = await courseService.removeUserFromAllowed(
            req.params.id,
            new Types.ObjectId(req.params.userId),
            userId
        );
        res.json({
            message: COURSE_MESSAGES.SUCCESS.USER_REMOVED_FROM_ALLOWED,
            course: updated
        });
    } catch (e) { next(e); }
};

export const addRating: RequestHandler = async (req, res, next) => {
    try {
        if (!isAuthenticatedRequest(req)) {
            throw new AppError(401, COURSE_MESSAGES.ERROR.UNAUTHORIZED);
        }
        const userId = getUserIdFromRequest(req);
        const updated = await courseService.addRating(
            req.params.id,
            userId,
            req.body.value
        );
        res.json({
            message: COURSE_MESSAGES.SUCCESS.RATING_ADDED,
            course: updated
        });
    } catch (e) { next(e); }
};

export const getRatings: RequestHandler = async (req, res, next) => {
    try {
        const ratings = await courseService.getRatings(req.params.id);
        res.json(ratings);
    } catch (e) { next(e); }
};

// Экспорт с валидацией для использования в routes
export const CourseController = {
    createCourse: [validate(createCourseSchema), createCourse],
    listCourse,
    getPublishedCourses,
    getCoursesByAuthor: [validate(authorParamSchema), getCoursesByAuthor],
    getCoursesByDifficulty: [validate(difficultyParamSchema), getCoursesByDifficulty],
    getCourse: [validate(idParamSchema), getCourse],
    updateCourse: [validate(updateCourseSchema), updateCourse],
    deleteCourse: [validate(idParamSchema), deleteCourse],
    addLesson: [validate(lessonManagementSchema), addLesson],
    removeLesson: [validate(lessonManagementSchema), removeLesson],
    addUserToAllowed: [validate(addUserToAllowedSchema), addUserToAllowed],
    removeUserFromAllowed: [validate(removeUserFromAllowedSchema), removeUserFromAllowed],
    addRating: [validate(addRatingSchema), addRating],
    getRatings: [validate(idParamSchema), getRatings]
};