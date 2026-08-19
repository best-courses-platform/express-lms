import { Router } from 'express';
import { LessonController } from './lesson.controller';
import { uploadFile, uploadSmallFilesMiddleware } from '../../middleware/upload-file';
import { jwtAuth, optionalAuth } from '../../middleware/auth';
import { requireVerifiedEmail } from '../../middleware/access';

const r = Router();

// публичные (доступны анонимно), но учитывают req.user, если он есть — уроки непубликованного
// курса видны только автору/allowedUsers (см. courseService.canAccess)
r.get('/', LessonController.listLessons);
r.get('/:id', optionalAuth, ...LessonController.getLesson);
r.get('/course/:courseId', optionalAuth, ...LessonController.getLessonsByCourse);
r.get('/:lessonId/access/:userId', ...LessonController.checkLessonAccess);

// защищённые
// Единственный путь создания урока — проверяет, что вызывающий является автором курса
// (см. createLessonForCourse). Общий POST /api/lessons без courseId-контекста удалён:
// он позволял верифицированному, но постороннему пользователю добавлять уроки в чужой курс.
r.post('/course/:courseId', jwtAuth, requireVerifiedEmail, ...LessonController.createLessonForCourse);
r.patch('/:id', jwtAuth, requireVerifiedEmail, ...LessonController.updateLesson);
r.delete('/:id', jwtAuth, requireVerifiedEmail, ...LessonController.deleteLesson);

r.post(
  '/:lessonId/files/video',
  jwtAuth,
  requireVerifiedEmail,
  uploadFile.single('file'),
  ...LessonController.uploadLessonFile
);

r.post(
  '/:lessonId/files/resource',
  jwtAuth,
  requireVerifiedEmail,
  uploadSmallFilesMiddleware.single('file'),
  ...LessonController.uploadLessonFile
);

r.delete('/:lessonId/files', jwtAuth, requireVerifiedEmail, ...LessonController.deleteLessonFile);
r.delete(
  '/:lessonId/resources/:resourceIndex',
  jwtAuth,
  requireVerifiedEmail,
  ...LessonController.deleteLessonResource
);

export default r;
