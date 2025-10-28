import { Course, NewCourse, UpdateCourse } from "./course.types";
import { CourseModel } from "./course.model";
import { Types } from 'mongoose';

class CourseRepository {
    async create(input: NewCourse): Promise<Course> {
        const course = new CourseModel(input);
        return await course.save();
    }

    async findAll(): Promise<Course[]> {
        return await CourseModel.find()
            .populate('author', 'name email avatar')
            .populate('lessons', 'title duration')
            .exec();
    }

    async findById(id: string): Promise<Course | null> {
        if (!Types.ObjectId.isValid(id)) return null;
        return await CourseModel.findById(id)
            .populate('author', 'name email avatar')
            .populate('lessons', 'title duration description')
            .exec();
    }

    async findByTitle(title: string): Promise<Course | null> {
        return await CourseModel.findOne({ title }).exec();
    }

    async findByAuthor(authorId: string): Promise<Course[]> {
        if (!Types.ObjectId.isValid(authorId)) return [];
        return await CourseModel.find({ author: authorId })
            .populate('lessons', 'title duration')
            .exec();
    }

    async findByDifficulty(difficulty: string): Promise<Course[]> {
        return await CourseModel.find({ difficulty })
            .populate('author', 'name email avatar')
            .populate('lessons', 'title duration')
            .exec();
    }

    async findPublished(): Promise<Course[]> {
        return await CourseModel.find({ isPublished: true })
            .populate('author', 'name email avatar')
            .populate('lessons', 'title duration')
            .sort({ createdAt: -1 })
            .exec();
    }

    async update(id: string, patch: UpdateCourse): Promise<Course> {
        if (!Types.ObjectId.isValid(id)) {
            throw new Error('Invalid course ID');
        }

        const updatedCourse = await CourseModel.findByIdAndUpdate(
            id,
            { ...patch },
            { new: true, runValidators: true }
        )
            .populate('author', 'name email avatar')
            .populate('lessons', 'title duration')
            .exec();

        if (!updatedCourse) {
            throw new Error('Course not found');
        }

        return updatedCourse;
    }

    async delete(id: string): Promise<boolean> {
        if (!Types.ObjectId.isValid(id)) return false;

        const result = await CourseModel.findByIdAndDelete(id).exec();
        return !!result;
    }

    async addLesson(courseId: string, lessonId: Types.ObjectId): Promise<Course> {
        if (!Types.ObjectId.isValid(courseId)) {
            throw new Error('Invalid course ID');
        }

        const updatedCourse = await CourseModel.findByIdAndUpdate(
            courseId,
            { $push: { lessons: lessonId } },
            { new: true, runValidators: true }
        )
            .populate('author', 'name email avatar')
            .populate('lessons', 'title duration')
            .exec();

        if (!updatedCourse) {
            throw new Error('Course not found');
        }

        return updatedCourse;
    }

    async removeLesson(courseId: string, lessonId: Types.ObjectId): Promise<Course> {
        if (!Types.ObjectId.isValid(courseId)) {
            throw new Error('Invalid course ID');
        }

        const updatedCourse = await CourseModel.findByIdAndUpdate(
            courseId,
            { $pull: { lessons: lessonId } },
            { new: true, runValidators: true }
        )
            .populate('author', 'name email avatar')
            .populate('lessons', 'title duration')
            .exec();

        if (!updatedCourse) {
            throw new Error('Course not found');
        }

        return updatedCourse;
    }

    async addRating(courseId: string, rating: { userId: Types.ObjectId; value: number; createdAt: Date }): Promise<Course> {
        if (!Types.ObjectId.isValid(courseId)) {
            throw new Error('Invalid course ID');
        }

        // Сначала найдем курс
        const course = await CourseModel.findById(courseId);
        if (!course) {
            throw new Error('Course not found');
        }

        // Удалим старый рейтинг пользователя, если есть
        await CourseModel.findByIdAndUpdate(
            courseId,
            { $pull: { ratings: { userId: rating.userId } } }
        ).exec();

        // Добавим новый рейтинг
        const updatedCourse = await CourseModel.findByIdAndUpdate(
            courseId,
            { $push: { ratings: rating } },
            { new: true, runValidators: true }
        )
            .populate('author', 'name email avatar')
            .populate('lessons', 'title duration')
            .exec();

        if (!updatedCourse) {
            throw new Error('Course not found');
        }

        return updatedCourse;
    }
}

export const courseRepository = new CourseRepository();