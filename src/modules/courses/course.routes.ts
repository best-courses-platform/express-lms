import { Router } from 'express';
import { CourseController } from './course.controller';
import { EnrollmentController } from 'enrollments/enrollment.controller';
import { jwtAuth, optionalAuth } from '../../middleware/auth';
import { requireVerifiedEmail, requireRole } from '../../middleware/access';
import { uploadImage } from '../../middleware/upload-file';

const r = Router();

// публичные (доступны анонимно), но /:id учитывает req.user, если он есть —
// непубликованный курс виден только автору/записанным студентам (см. CourseController.getCourse)
r.get('/', CourseController.listCourse);
r.get('/published', CourseController.getPublishedCourses);
// /search — статический путь, обязан идти раньше /:id, иначе Express матчит "search"
// как значение :id (см. Obsidian: порядок роутов Express).
r.get('/search', ...CourseController.searchCourses);
r.get('/author/:authorId', ...CourseController.getCoursesByAuthor);
r.get('/difficulty/:level', ...CourseController.getCoursesByDifficulty);
r.get('/mine', jwtAuth, requireVerifiedEmail, CourseController.getMyCourses);
r.get('/:id', optionalAuth, ...CourseController.getCourse);

// защищённые
r.post(
  '/preview-image',
  jwtAuth,
  requireVerifiedEmail,
  requireRole(['author', 'admin']),
  uploadImage.single('file'),
  CourseController.uploadCoursePreviewImage
);
r.post('/', jwtAuth, requireVerifiedEmail, requireRole(['author', 'admin']), ...CourseController.createCourse);
r.patch('/:id', jwtAuth, requireVerifiedEmail, ...CourseController.updateCourse);
r.delete('/:id', jwtAuth, requireVerifiedEmail, ...CourseController.deleteCourse);

// уроки в курсе
r.post('/:id/lessons/:lessonId', jwtAuth, requireVerifiedEmail, ...CourseController.addLesson);
r.delete('/:id/lessons/:lessonId', jwtAuth, requireVerifiedEmail, ...CourseController.removeLesson);

// запись студентов на курс — управляет только автор, см. enrollment.service.ts#assertIsAuthor
r.post('/:id/enrollments', jwtAuth, requireVerifiedEmail, ...EnrollmentController.enroll);
r.get('/:id/enrollments', jwtAuth, requireVerifiedEmail, ...EnrollmentController.listStudents);
r.delete('/:id/enrollments/:userId', jwtAuth, requireVerifiedEmail, ...EnrollmentController.unenroll);

// рейтинг
r.post('/:id/ratings', jwtAuth, requireVerifiedEmail, ...CourseController.addRating);
r.get('/:id/ratings', ...CourseController.getRatings);

export default r;
