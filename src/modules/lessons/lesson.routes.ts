import { Router } from "express";
import * as LessonController from "./lesson.controller";

const router = Router();

// Основные CRUD операции
router.post("/", LessonController.createLesson);
router.get("/", LessonController.listLessons);
router.get("/:id", LessonController.getLesson);
router.patch("/:id", LessonController.updateLesson);
router.delete("/:id", LessonController.deleteLesson);

// Дополнительные маршруты
router.get("/course/:courseId", LessonController.getLessonsByCourse);
router.get("/:lessonId/access/:userId", LessonController.checkLessonAccess);
router.post("/:lessonId/allowed-users", LessonController.addUserToAllowed);

export default router;