import {Course, NewCourse, Rating, UpdateCourse} from "./course.types";
import { courseRepository } from "./course.repository";
import { AppError } from "../../utils/errors";
import { Types } from 'mongoose';

class CourseService {
    async create(input: NewCourse): Promise<Course> {
        const exists = await courseRepository.findByTitle(input.title);

        if (exists) throw new AppError(409, "This course already exists");

        return courseRepository.create(input);
    }

    async list(): Promise<Course[]> {
        return courseRepository.findAll();
    }

    async getPublishedCourses(): Promise<Course[]> {
        return courseRepository.findPublished();
    }

    async getCoursesByAuthor(authorId: string): Promise<Course[]> {
        return courseRepository.findByAuthor(authorId);
    }

    async getCoursesByDifficulty(difficulty: string): Promise<Course[]> {
        return courseRepository.findByDifficulty(difficulty);
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

    async addLesson(courseId: string, lessonId: string): Promise<Course> {
        const course = await courseRepository.findById(courseId);
        if (!course) throw new AppError(404, "Course not found");

        return courseRepository.addLesson(courseId, new Types.ObjectId(lessonId));
    }

    async removeLesson(courseId: string, lessonId: string): Promise<Course> {
        const course = await courseRepository.findById(courseId);
        if (!course) throw new AppError(404, "Course not found");

        return courseRepository.removeLesson(courseId, new Types.ObjectId(lessonId));
    }

    async addRating(courseId: string, userId: Types.ObjectId, value: number): Promise<Course> {
        const course = await courseRepository.findById(courseId);
        if (!course) throw new AppError(404, "Course not found");

        if (value < 1 || value > 5) {
            throw new AppError(400, "Rating must be between 1 and 5");
        }

        return courseRepository.addRating(courseId, {
            userId: userId,
            value,
            createdAt: new Date()
        });
    }

    async getRatings(courseId: string): Promise<Rating[]> {
        const course = await courseRepository.findById(courseId);
        if (!course) throw new AppError(404, "Course not found");

        return course.ratings;
    }
}

export const courseService = new CourseService();