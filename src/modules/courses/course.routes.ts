import { Router } from "express";
import * as CourseController from "./course.controller";

const router = Router();

router.post("/", CourseController.createCourse);
router.get("/", CourseController.listCourse);
router.get("/:id", CourseController.getCourse);
router.patch("/:id", CourseController.updateCourse);
router.delete("/:id", CourseController.deleteCourse);

export default router;