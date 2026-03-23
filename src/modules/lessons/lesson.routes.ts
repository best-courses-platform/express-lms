// domains/lessons/lesson.routes.ts
// import { Router } from 'express';
// import { LessonController } from './lesson.controller';
// import { uploadFile, uploadSmallFilesMiddleware } from '../../middleware/upload-file';
//
// const lessonsRouter = Router();
//
// // Основные CRUD операции
// lessonsRouter.post('/', ...LessonController.createLesson);
// lessonsRouter.get('/', LessonController.listLessons);
// lessonsRouter.get('/:id', ...LessonController.getLesson);
// lessonsRouter.patch('/:id', ...LessonController.updateLesson);
// lessonsRouter.delete('/:id', ...LessonController.deleteLesson);
//
// // Дополнительные маршруты
// lessonsRouter.get('/course/:courseId', ...LessonController.getLessonsByCourse);
// lessonsRouter.post('/course/:courseId', ...LessonController.createLessonForCourse);
// lessonsRouter.get('/:lessonId/access/:userId', ...LessonController.checkLessonAccess);
//
// // Загрузка файлов
// lessonsRouter.post('/:lessonId/files/video', uploadFile.single('file'), ...LessonController.uploadLessonFile);
//
// lessonsRouter.post(
//   '/:lessonId/files/resource',
//   uploadSmallFilesMiddleware.single('file'),
//   ...LessonController.uploadLessonFile,
// );
//
// // Удаление файлов
// lessonsRouter.delete('/:lessonId/files', ...LessonController.deleteLessonFile);
// lessonsRouter.delete('/:lessonId/resources/:resourceIndex', ...LessonController.deleteLessonResource);
//
// // lessonsRouter.post('/', jwtAuth, requireVerifiedEmail, ...LessonController.createLesson);
// // lessonsRouter.patch('/:id', jwtAuth, requireVerifiedEmail, ...LessonController.updateLesson);
// // lessonsRouter.delete('/:id', jwtAuth, requireVerifiedEmail, ...LessonController.deleteLesson);
// //
// // lessonsRouter.post('/:lessonId/files/video',
// //   jwtAuth,
// //   requireVerifiedEmail,
// //   uploadFile.single('file'),
// //   ...LessonController.uploadLessonFile
// // );
//
// export default lessonsRouter;

import { Router } from 'express';
import { LessonController } from './lesson.controller';
import { uploadFile, uploadSmallFilesMiddleware } from '../../middleware/upload-file';
import { jwtAuth } from '../../middleware/auth';
import { requireVerifiedEmail } from '../../middleware/access';

const r = Router();

// публичные
r.get('/', LessonController.listLessons);
r.get('/:id', ...LessonController.getLesson);
r.get('/course/:courseId', ...LessonController.getLessonsByCourse);
r.get('/:lessonId/access/:userId', ...LessonController.checkLessonAccess);

// защищённые
r.post('/', jwtAuth, requireVerifiedEmail, ...LessonController.createLesson);
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
