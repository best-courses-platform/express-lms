// course.routes.ts
import { Router } from "express";
import * as CourseController from "./course.controller";

const router = Router();

// Основные CRUD операции
router.post("/", CourseController.createCourse);
router.get("/", CourseController.listCourse);
router.get("/published", CourseController.getPublishedCourses);
router.get("/author/:authorId", CourseController.getCoursesByAuthor);
router.get("/difficulty/:level", CourseController.getCoursesByDifficulty);
router.get("/:id", CourseController.getCourse);
router.patch("/:id", CourseController.updateCourse);
router.delete("/:id", CourseController.deleteCourse);

// Управление уроками в курсе
router.post("/:id/lessons/:lessonId", CourseController.addLesson);
router.delete("/:id/lessons/:lessonId", CourseController.removeLesson);

// Управление рейтингами
router.post("/:id/ratings", CourseController.addRating);
router.get("/:id/ratings", CourseController.getRatings); // получить все рейтинги курса

export default router;