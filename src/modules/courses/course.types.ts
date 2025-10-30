import { Types } from 'mongoose';

export type Rating = {
    userId: Types.ObjectId;
    value: number;
    createdAt: Date;
}

export type Course = {
    _id: Types.ObjectId;
    title: string;
    description: string;
    previewImage: string;
    author: Types.ObjectId; // теперь ссылка на пользователя
    tags: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    lessons?: Types.ObjectId[]; // массив уроков курса
    ratings: Rating[];
    averageRating?: number;
    isPublished: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export type NewCourse = Omit<Course, "_id" | "createdAt" | "updatedAt" | "averageRating" | "lessons">;
export type UpdateCourse = Partial<Course>;
