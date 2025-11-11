import { Router } from "express";
import * as LessonController from "./lesson.controller";
import { uploadFile, uploadSmallFilesMiddleware } from "../../middleware/upload-file";

const lessonsRouter = Router();

// Основные CRUD операции
lessonsRouter.post("/", LessonController.createLesson);
lessonsRouter.get("/", LessonController.listLessons);
lessonsRouter.get("/:id", LessonController.getLesson);
lessonsRouter.patch("/:id", LessonController.updateLesson);
lessonsRouter.delete("/:id", LessonController.deleteLesson);

// Дополнительные маршруты
lessonsRouter.get("/course/:courseId", LessonController.getLessonsByCourse);
lessonsRouter.post("/course/:courseId", LessonController.createLessonForCourse);
lessonsRouter.get("/:lessonId/access/:userId", LessonController.checkLessonAccess);

lessonsRouter.post(
    "/:lessonId/files/video",
    uploadFile.single('file'),
    LessonController.uploadLessonFile
);

// Для ресурсов (небольшие файлы)
lessonsRouter.post(
    "/:lessonId/files/resource",
    uploadSmallFilesMiddleware.single('file'),
    LessonController.uploadLessonFile
);

lessonsRouter.delete("/:lessonId/files", LessonController.deleteLessonFile);
lessonsRouter.delete("/:lessonId/resources/:resourceIndex", LessonController.deleteLessonResource);

export default lessonsRouter;