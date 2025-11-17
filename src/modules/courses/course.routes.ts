// domains/courses/course.routes.ts
import { Router } from "express";
import { CourseController } from "./course.controller";

const coursesRouter = Router();

// Основные CRUD операции
coursesRouter.post("/", ...CourseController.createCourse);
coursesRouter.get("/", CourseController.listCourse);
coursesRouter.get("/published", CourseController.getPublishedCourses);
coursesRouter.get("/author/:authorId", ...CourseController.getCoursesByAuthor);
coursesRouter.get("/difficulty/:level", ...CourseController.getCoursesByDifficulty);
coursesRouter.get("/:id", ...CourseController.getCourse);
coursesRouter.patch("/:id", ...CourseController.updateCourse);
coursesRouter.delete("/:id", ...CourseController.deleteCourse);

// Управление уроками в курсе
coursesRouter.post("/:id/lessons/:lessonId", ...CourseController.addLesson);
coursesRouter.delete("/:id/lessons/:lessonId", ...CourseController.removeLesson);

// Управление доступом пользователей
coursesRouter.post("/:id/allowed-users", ...CourseController.addUserToAllowed);
coursesRouter.delete("/:id/allowed-users/:userId", ...CourseController.removeUserFromAllowed);

// Управление рейтингами
coursesRouter.post("/:id/ratings", ...CourseController.addRating);
coursesRouter.get("/:id/ratings", ...CourseController.getRatings);

export default coursesRouter;