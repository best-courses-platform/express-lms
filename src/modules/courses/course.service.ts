import { Course, NewCourse, UpdateCourse } from "./course.types";
import { courseRepository } from "./course.repository";
import { AppError } from "../../utils/errors";

 class CourseService {
    async create(input: NewCourse): Promise<Course> {
        const exists = await courseRepository.findByTitle(input.title);

        if (exists) throw new AppError(409, "This course already exists");

        return courseRepository.create(input);
    }

    async list(): Promise<Course[]> {
        return courseRepository.findAll();
    }

    async getById(id: string): Promise<Course> {
        const course = await courseRepository.findById(id);

        if (!course) throw new AppError(404, "Course not found");

        return course;
    }

    async update(id: string, patch: UpdateCourse): Promise<Course> {
        const course = await courseRepository.findById(id);

        if (!course) throw new AppError(404, "Course not found");

        if (patch.title && patch.title !== course.title) {
            const exists = await courseRepository.findByTitle(patch.title);

            if (exists) throw new AppError(409, "This course already exists");
        }

        return courseRepository.update(id, patch);
    }

    async delete(id: string): Promise<void> {
        const ok = await courseRepository.delete(id);

        if (!ok) throw new AppError(404, "Course not found");
    }
}

export const courseService = new CourseService();