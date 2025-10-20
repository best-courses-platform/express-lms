import { randomUUID } from "crypto";
import { Course, NewCourse, UpdateCourse } from "./course.types";

const createStubCourse = (overrides?: Partial<Course>): Course => ({
    _id: randomUUID() as string,
    title: "Stub Course",
    description: "Stub description",
    previewImage: "Stub image url",
    author: "Stub Author",
    tags: ['javascript', 'typescript'],
    ...overrides
} as Course);

class CourseRepository {
    async create(input: NewCourse): Promise<Course> {
        return createStubCourse(input);
    }

    async findAll(): Promise<Course[]> {
        return [createStubCourse()]
    }

    async findById(id: string): Promise<Course | null> {
        return null
    }

    async findByTitle(title: string): Promise<Course | null> {
        return null
    }

    async update(id: string, patch: UpdateCourse): Promise<Course> {
        return createStubCourse()
    }

    async delete(id: string): Promise<boolean> {
        return true;
    }
}

export const courseRepository = new CourseRepository();