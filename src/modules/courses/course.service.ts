// domains/courses/course.service.ts
import { Course, NewCourse, Rating } from "./course.types";
import { courseRepository } from "./course.repository";
import { AppError } from "../../utils/errors";
import { Types } from 'mongoose';
import { CreateCourseInput, UpdateCourseInput } from "./course.schema";
import { COURSE_MESSAGES } from "./course.constants";

class CourseService {
    async create(input: CreateCourseInput): Promise<Course> {
        const exists = await courseRepository.findByTitle(input.title);

        if (exists) throw new AppError(409, COURSE_MESSAGES.ERROR.COURSE_ALREADY_EXISTS);

        const courseData: NewCourse = {
            ...input,
            author: new Types.ObjectId(input.author),
            isPublished: input.isPublished ?? false
        };

        return courseRepository.create(courseData);
    }

    async update(id: string, patch: UpdateCourseInput): Promise<Course> {
        const course = await courseRepository.findById(id);

        if (!course) throw new AppError(404, COURSE_MESSAGES.ERROR.COURSE_NOT_FOUND);

        if (patch.title && patch.title !== course.title) {
            const exists = await courseRepository.findByTitle(patch.title);
            if (exists) throw new AppError(409, COURSE_MESSAGES.ERROR.COURSE_ALREADY_EXISTS);
        }

        return courseRepository.update(id, patch);
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
        if (!course) throw new AppError(404, COURSE_MESSAGES.ERROR.COURSE_NOT_FOUND);
        
        return course;
    }

    async delete(id: string): Promise<void> {
        const ok = await courseRepository.delete(id);
        if (!ok) throw new AppError(404, COURSE_MESSAGES.ERROR.COURSE_NOT_FOUND);
    }

    async addLesson(courseId: string, lessonId: string, userId: Types.ObjectId): Promise<Course> {
        const course = await courseRepository.findById(courseId);
        if (!course) throw new AppError(404, COURSE_MESSAGES.ERROR.COURSE_NOT_FOUND);

        if (!course.author.equals(userId)) {
            throw new AppError(403, COURSE_MESSAGES.ERROR.NOT_AUTHOR);
        }

        return courseRepository.addLesson(courseId, new Types.ObjectId(lessonId));
    }

    async removeLesson(courseId: string, lessonId: string, userId: Types.ObjectId): Promise<Course> {
        const course = await courseRepository.findById(courseId);
        if (!course) throw new AppError(404, COURSE_MESSAGES.ERROR.COURSE_NOT_FOUND);

        if (!course.author.equals(userId)) {
            throw new AppError(403, COURSE_MESSAGES.ERROR.NOT_AUTHOR);
        }

        return courseRepository.removeLesson(courseId, new Types.ObjectId(lessonId));
    }

    async addUserToAllowed(courseId: string, userId: Types.ObjectId, authorId: Types.ObjectId): Promise<Course> {
        const course = await courseRepository.findById(courseId);
        if (!course) throw new AppError(404, COURSE_MESSAGES.ERROR.COURSE_NOT_FOUND);

        if (!course.author.equals(authorId)) {
            throw new AppError(403, COURSE_MESSAGES.ERROR.NOT_AUTHOR);
        }

        return courseRepository.addUserToAllowed(courseId, userId);
    }

    async removeUserFromAllowed(courseId: string, userId: Types.ObjectId, authorId: Types.ObjectId): Promise<Course> {
        const course = await courseRepository.findById(courseId);
        if (!course) throw new AppError(404, COURSE_MESSAGES.ERROR.COURSE_NOT_FOUND);

        if (!course.author.equals(authorId)) {
            throw new AppError(403, COURSE_MESSAGES.ERROR.NOT_AUTHOR);
        }

        return courseRepository.removeUserFromAllowed(courseId, userId);
    }

    async addRating(courseId: string, userId: Types.ObjectId, value: number): Promise<Course> {
        const course = await courseRepository.findById(courseId);
        if (!course) throw new AppError(404, COURSE_MESSAGES.ERROR.COURSE_NOT_FOUND);

        if (value < 1 || value > 5) {
            throw new AppError(400, COURSE_MESSAGES.VALIDATION.RATING_MIN);
        }

        return courseRepository.addRating(courseId, {
            userId: userId,
            value,
            createdAt: new Date()
        });
    }

    async getRatings(courseId: string): Promise<Rating[]> {
        const course = await courseRepository.findById(courseId);
        if (!course) throw new AppError(404, COURSE_MESSAGES.ERROR.COURSE_NOT_FOUND);
        return course.ratings;
    }
}

export const courseService = new CourseService();