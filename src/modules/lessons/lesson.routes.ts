import { Router } from "express";
import * as LessonController from "./lesson.controller";

const lessonsRouter = Router();

// Основные CRUD операции
lessonsRouter.post("/", LessonController.createLesson);
lessonsRouter.get("/", LessonController.listLessons);
lessonsRouter.get("/:id", LessonController.getLesson);
lessonsRouter.patch("/:id", LessonController.updateLesson);
lessonsRouter.delete("/:id", LessonController.deleteLesson);

// Дополнительные маршруты
lessonsRouter.get("/course/:courseId", LessonController.getLessonsByCourse);
lessonsRouter.get("/:lessonId/access/:userId", LessonController.checkLessonAccess);
lessonsRouter.post("/:lessonId/allowed-users", LessonController.addUserToAllowed);

export default lessonsRouter;