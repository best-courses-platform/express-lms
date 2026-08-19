import { Router } from 'express';
import { CourseController } from './course.controller';
import { jwtAuth, optionalAuth } from '../../middleware/auth';
import { requireVerifiedEmail, requireRole } from '../../middleware/access';

const r = Router();

// публичные (доступны анонимно), но /:id учитывает req.user, если он есть —
// непубликованный курс виден только автору/allowedUsers (см. CourseController.getCourse)
r.get('/', CourseController.listCourse);
r.get('/published', CourseController.getPublishedCourses);
r.get('/author/:authorId', ...CourseController.getCoursesByAuthor);
r.get('/difficulty/:level', ...CourseController.getCoursesByDifficulty);
r.get('/mine', jwtAuth, requireVerifiedEmail, CourseController.getMyCourses);
r.get('/:id', optionalAuth, ...CourseController.getCourse);

// защищённые
r.post('/', jwtAuth, requireVerifiedEmail, requireRole(['author', 'admin']), ...CourseController.createCourse);
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
