// domains/courses/course.routes.ts
// import { Router } from 'express';
// import { CourseController } from './course.controller';
//
// const coursesRouter = Router();
//
// // Основные CRUD операции
// coursesRouter.post('/', ...CourseController.createCourse);
// coursesRouter.get('/', CourseController.listCourse);
// coursesRouter.get('/published', CourseController.getPublishedCourses);
// coursesRouter.get('/author/:authorId', ...CourseController.getCoursesByAuthor);
// coursesRouter.get('/difficulty/:level', ...CourseController.getCoursesByDifficulty);
// coursesRouter.get('/:id', ...CourseController.getCourse);
// coursesRouter.patch('/:id', ...CourseController.updateCourse);
// coursesRouter.delete('/:id', ...CourseController.deleteCourse);
//
// // Управление уроками в курсе
// coursesRouter.post('/:id/lessons/:lessonId', ...CourseController.addLesson);
// coursesRouter.delete('/:id/lessons/:lessonId', ...CourseController.removeLesson);
//
// // Управление доступом пользователей
// coursesRouter.post('/:id/allowed-users', ...CourseController.addUserToAllowed);
// coursesRouter.delete('/:id/allowed-users/:userId', ...CourseController.removeUserFromAllowed);
//
// // Управление рейтингами
// coursesRouter.post('/:id/ratings', ...CourseController.addRating);
// coursesRouter.get('/:id/ratings', ...CourseController.getRatings);
//
// // coursesRouter.post('/', jwtAuth, requireVerifiedEmail, ...CourseController.createCourse);
// // coursesRouter.patch('/:id', jwtAuth, requireVerifiedEmail, ...CourseController.updateCourse);
// // coursesRouter.delete('/:id', jwtAuth, requireVerifiedEmail, ...CourseController.deleteCourse);
// //
// // coursesRouter.post('/:id/lessons/:lessonId', jwtAuth, requireVerifiedEmail, ...CourseController.addLesson);
// // coursesRouter.delete('/:id/lessons/:lessonId', jwtAuth, requireVerifiedEmail, ...CourseController.removeLesson);
// //
// // coursesRouter.post('/:id/allowed-users', jwtAuth, requireVerifiedEmail, ...CourseController.addUserToAllowed);
// // coursesRouter.delete('/:id/allowed-users/:userId', jwtAuth, requireVerifiedEmail, ...CourseController.removeUserFromAllowed);
// //
// // coursesRouter.post('/:id/ratings', jwtAuth, requireVerifiedEmail, ...CourseController.addRating);
//
// export default coursesRouter;

import { Router } from 'express';
import { CourseController } from './course.controller';
import { jwtAuth } from '../../middleware/auth';
import { requireVerifiedEmail } from '../../middleware/access';

const r = Router();

// публичные
r.get('/', CourseController.listCourse);
r.get('/published', CourseController.getPublishedCourses);
r.get('/author/:authorId', ...CourseController.getCoursesByAuthor);
r.get('/difficulty/:level', ...CourseController.getCoursesByDifficulty);
r.get('/:id', ...CourseController.getCourse);

// защищённые
r.post('/', jwtAuth, requireVerifiedEmail, ...CourseController.createCourse);
r.patch('/:id', jwtAuth, requireVerifiedEmail, ...CourseController.updateCourse);
r.delete('/:id', jwtAuth, requireVerifiedEmail, ...CourseController.deleteCourse);

// уроки в курсе
r.post('/:id/lessons/:lessonId', jwtAuth, requireVerifiedEmail, ...CourseController.addLesson);
r.delete('/:id/lessons/:lessonId', jwtAuth, requireVerifiedEmail, ...CourseController.removeLesson);

// доступ пользователей
r.post('/:id/allowed-users', jwtAuth, requireVerifiedEmail, ...CourseController.addUserToAllowed);
r.delete('/:id/allowed-users/:userId', jwtAuth, requireVerifiedEmail, ...CourseController.removeUserFromAllowed);

// рейтинг
r.post('/:id/ratings', jwtAuth, requireVerifiedEmail, ...CourseController.addRating);
r.get('/:id/ratings', ...CourseController.getRatings);

export default r;
