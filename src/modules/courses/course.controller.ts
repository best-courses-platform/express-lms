import { RequestHandler } from 'express';
import { courseService } from './course.service';
import { fileStorageService } from '../file-storage/file-storage.service';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../../utils/errors';
import { isAuthenticatedRequest, getUserIdFromRequest } from '../../utils/typeGuards';
import { Types } from 'mongoose';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/async-handler';
import {
  createCourseSchema,
  updateCourseSchema,
  idParamSchema,
  authorParamSchema,
  difficultyParamSchema,
  lessonManagementSchema,
  addUserToAllowedSchema,
  removeUserFromAllowedSchema,
  addRatingSchema,
} from './course.schema';
import { COURSE_MESSAGES } from './course.constants';

export const createCourse: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(COURSE_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const userId = getUserIdFromRequest(req);
  const course = await courseService.create(req.body, userId);
  res.status(201).json({
    message: COURSE_MESSAGES.SUCCESS.COURSE_CREATED,
    course,
  });
};

export const listCourse: RequestHandler = async (_req, res) => {
  const courses = await courseService.list();
  res.json(courses);
};

export const getPublishedCourses: RequestHandler = async (_req, res) => {
  const courses = await courseService.getPublishedCourses();
  res.json(courses);
};

export const getCoursesByAuthor: RequestHandler = async (req, res) => {
  const courses = await courseService.getCoursesByAuthor(req.params.authorId);
  res.json(courses);
};

export const getMyCourses: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(COURSE_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const userId = getUserIdFromRequest(req);
  const courses = await courseService.getMyCourses(userId, req.user.role);
  res.json(courses);
};

export const uploadCoursePreviewImage: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(COURSE_MESSAGES.ERROR.UNAUTHORIZED);
  }
  if (!req.file) {
    throw new BadRequestError(COURSE_MESSAGES.ERROR.PREVIEW_IMAGE_NOT_UPLOADED);
  }

  const uploaded = await fileStorageService.uploadFile(req.file.buffer, {
    folder: 'courses/previews',
    filename: req.file.originalname,
    contentType: req.file.mimetype,
  });

  res.json({ message: COURSE_MESSAGES.SUCCESS.PREVIEW_IMAGE_UPLOADED, url: uploaded.url });
};

export const getCoursesByDifficulty: RequestHandler = async (req, res) => {
  const courses = await courseService.getCoursesByDifficulty(req.params.level);
  res.json(courses);
};

export const getCourse: RequestHandler = async (req, res) => {
  const course = await courseService.getById(req.params.id);

  if (!courseService.canAccess(course, req.user?._id)) {
    throw new ForbiddenError(COURSE_MESSAGES.ERROR.FORBIDDEN);
  }

  res.json(course);
};

export const updateCourse: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(COURSE_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const userId = getUserIdFromRequest(req);
  const updated = await courseService.update(req.params.id, req.body, userId);
  res.json({
    message: COURSE_MESSAGES.SUCCESS.COURSE_UPDATED,
    course: updated,
  });
};

export const deleteCourse: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(COURSE_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const userId = getUserIdFromRequest(req);
  await courseService.delete(req.params.id, userId);
  res.json({ message: COURSE_MESSAGES.SUCCESS.COURSE_DELETED });
};

export const addLesson: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(COURSE_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const userId = getUserIdFromRequest(req);
  const updated = await courseService.addLesson(req.params.id, req.params.lessonId, userId);
  res.json({
    message: COURSE_MESSAGES.SUCCESS.LESSON_ADDED,
    course: updated,
  });
};

export const removeLesson: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(COURSE_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const userId = getUserIdFromRequest(req);
  const updated = await courseService.removeLesson(req.params.id, req.params.lessonId, userId);
  res.json({
    message: COURSE_MESSAGES.SUCCESS.LESSON_REMOVED,
    course: updated,
  });
};

export const addUserToAllowed: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(COURSE_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const userId = getUserIdFromRequest(req);
  const updated = await courseService.addUserToAllowed(req.params.id, new Types.ObjectId(req.body.userId), userId);
  res.json({
    message: COURSE_MESSAGES.SUCCESS.USER_ADDED_TO_ALLOWED,
    course: updated,
  });
};

export const removeUserFromAllowed: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(COURSE_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const userId = getUserIdFromRequest(req);
  const updated = await courseService.removeUserFromAllowed(
    req.params.id,
    new Types.ObjectId(req.params.userId),
    userId
  );
  res.json({
    message: COURSE_MESSAGES.SUCCESS.USER_REMOVED_FROM_ALLOWED,
    course: updated,
  });
};

export const addRating: RequestHandler = async (req, res) => {
  if (!isAuthenticatedRequest(req)) {
    throw new UnauthorizedError(COURSE_MESSAGES.ERROR.UNAUTHORIZED);
  }
  const userId = getUserIdFromRequest(req);
  const updated = await courseService.addRating(req.params.id, userId, req.body.value);
  res.json({
    message: COURSE_MESSAGES.SUCCESS.RATING_ADDED,
    course: updated,
  });
};

export const getRatings: RequestHandler = async (req, res) => {
  const ratings = await courseService.getRatings(req.params.id);
  res.json(ratings);
};

// Экспорт с валидацией для использования в routes
export const CourseController = {
  createCourse: [validate(createCourseSchema), asyncHandler(createCourse)],
  listCourse: asyncHandler(listCourse),
  getPublishedCourses: asyncHandler(getPublishedCourses),
  getCoursesByAuthor: [validate(authorParamSchema), asyncHandler(getCoursesByAuthor)],
  getMyCourses: asyncHandler(getMyCourses),
  uploadCoursePreviewImage: asyncHandler(uploadCoursePreviewImage),
  getCoursesByDifficulty: [validate(difficultyParamSchema), asyncHandler(getCoursesByDifficulty)],
  getCourse: [validate(idParamSchema), asyncHandler(getCourse)],
  updateCourse: [validate(updateCourseSchema), asyncHandler(updateCourse)],
  deleteCourse: [validate(idParamSchema), asyncHandler(deleteCourse)],
  addLesson: [validate(lessonManagementSchema), asyncHandler(addLesson)],
  removeLesson: [validate(lessonManagementSchema), asyncHandler(removeLesson)],
  addUserToAllowed: [validate(addUserToAllowedSchema), asyncHandler(addUserToAllowed)],
  removeUserFromAllowed: [validate(removeUserFromAllowedSchema), asyncHandler(removeUserFromAllowed)],
  addRating: [validate(addRatingSchema), asyncHandler(addRating)],
  getRatings: [validate(idParamSchema), asyncHandler(getRatings)],
};
