import { model, Schema } from 'mongoose';
import { Lesson, VideoFile, LessonResource } from "./lesson.types";

const lessonResourceSchema = new Schema({
    type: {
        type: String,
        enum: ['file', 'link', 'video'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    url: String,
    description: String,
    fileSize: Number,
    mimeType: String,
    originalName: String
}, { _id: false });

const videoFileSchema = new Schema({
    url: String,
    originalName: String,
    size: Number,
    duration: Number,
    mimeType: String
}, { _id: false });

const lessonSchema = new Schema<Lesson>({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    courseId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    order: {
        type: Number,
        required: true,
        min: 1
    },
    videoFile: videoFileSchema,
    resources: [lessonResourceSchema],
    inputExamples: String,
    outputExamples: String,
    tags: [{
        type: String,
        trim: true
    }]
}, {
    timestamps: true // Автоматически добавляет createdAt и updatedAt
});

// Индекс для уникальности названия урока в рамках курса
lessonSchema.index({ title: 1, courseId: 1 }, { unique: true });

// Индекс для сортировки уроков в курсе
lessonSchema.index({ courseId: 1, order: 1 });

export const LessonModel = model<Lesson>('Lesson', lessonSchema);