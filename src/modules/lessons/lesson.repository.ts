import { Lesson, NewLesson, UpdateLesson } from "./lesson.types";
import { LessonModel } from "./lesson.model";
import { Types } from 'mongoose';

class LessonRepository {
    async create(input: NewLesson): Promise<Lesson> {
        const lesson = new LessonModel(input);
        return await lesson.save();
    }

    async findAll(): Promise<Lesson[]> {
        return await LessonModel.find()
            .populate('courseId', 'title description')
            .populate('allowedUsers', 'name email')
            .sort({ createdAt: -1 })
            .exec();
    }

    async findById(id: string): Promise<Lesson | null> {
        if (!Types.ObjectId.isValid(id)) return null;
        return await LessonModel.findById(id)
            .populate('courseId', 'title description')
            .populate('allowedUsers', 'name email')
            .exec();
    }

    async findByTitleAndCourse(title: string, courseId: string): Promise<Lesson | null> {
        if (!Types.ObjectId.isValid(courseId)) return null;
        return await LessonModel.findOne({
            title,
            courseId: new Types.ObjectId(courseId)
        }).exec();
    }

    async findByCourseId(courseId: string): Promise<Lesson[]> {
        if (!Types.ObjectId.isValid(courseId)) return [];
        return await LessonModel.find({ courseId: new Types.ObjectId(courseId) })
            .populate('allowedUsers', 'name email')
            .sort({ order: 1 }) // сортируем по порядку
            .exec();
    }

    async findByCourseIdWithPagination(courseId: string, page: number = 1, limit: number = 10): Promise<{ lessons: Lesson[], total: number }> {
        if (!Types.ObjectId.isValid(courseId)) return { lessons: [], total: 0 };

        const skip = (page - 1) * limit;
        const [lessons, total] = await Promise.all([
            LessonModel.find({ courseId: new Types.ObjectId(courseId) })
                .populate('allowedUsers', 'name email')
                .sort({ order: 1 })
                .skip(skip)
                .limit(limit)
                .exec(),
            LessonModel.countDocuments({ courseId: new Types.ObjectId(courseId) })
        ]);

        return { lessons, total };
    }

    async update(id: string, patch: UpdateLesson): Promise<Lesson> {
        if (!Types.ObjectId.isValid(id)) {
            throw new Error('Invalid lesson ID');
        }

        const updatedLesson = await LessonModel.findByIdAndUpdate(
            id,
            { ...patch },
            { new: true, runValidators: true }
        )
            .populate('courseId', 'title description')
            .populate('allowedUsers', 'name email')
            .exec();

        if (!updatedLesson) {
            throw new Error('Lesson not found');
        }

        return updatedLesson;
    }

    async delete(id: string): Promise<boolean> {
        if (!Types.ObjectId.isValid(id)) return false;

        const result = await LessonModel.findByIdAndDelete(id).exec();
        return !!result;
    }

    async addUserToAllowed(lessonId: string, userId: Types.ObjectId): Promise<Lesson> {
        if (!Types.ObjectId.isValid(lessonId)) {
            throw new Error('Invalid lesson ID');
        }

        const updatedLesson = await LessonModel.findByIdAndUpdate(
            lessonId,
            { $addToSet: { allowedUsers: userId } }, // $addToSet предотвращает дубликаты
            { new: true, runValidators: true }
        )
            .populate('courseId', 'title description')
            .populate('allowedUsers', 'name email')
            .exec();

        if (!updatedLesson) {
            throw new Error('Lesson not found');
        }

        return updatedLesson;
    }

    async removeUserFromAllowed(lessonId: string, userId: Types.ObjectId): Promise<Lesson> {
        if (!Types.ObjectId.isValid(lessonId)) {
            throw new Error('Invalid lesson ID');
        }

        const updatedLesson = await LessonModel.findByIdAndUpdate(
            lessonId,
            { $pull: { allowedUsers: userId } },
            { new: true, runValidators: true }
        )
            .populate('courseId', 'title description')
            .populate('allowedUsers', 'name email')
            .exec();

        if (!updatedLesson) {
            throw new Error('Lesson not found');
        }

        return updatedLesson;
    }

    async getNextOrderNumber(courseId: string): Promise<number> {
        if (!Types.ObjectId.isValid(courseId)) return 1;

        const lastLesson = await LessonModel.findOne({ courseId: new Types.ObjectId(courseId) })
            .sort({ order: -1 })
            .select('order')
            .exec();

        return lastLesson ? lastLesson.order + 1 : 1;
    }

    async reorderLessons(courseId: string, newOrder: { lessonId: string, order: number }[]): Promise<void> {
        if (!Types.ObjectId.isValid(courseId)) return;

        const bulkOps = newOrder.map(({ lessonId, order }) => ({
            updateOne: {
                filter: { _id: new Types.ObjectId(lessonId), courseId: new Types.ObjectId(courseId) },
                update: { $set: { order } }
            }
        }));

        await LessonModel.bulkWrite(bulkOps);
    }
}

export const lessonRepository = new LessonRepository();