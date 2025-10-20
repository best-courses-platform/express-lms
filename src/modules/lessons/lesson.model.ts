import { model, Schema } from 'mongoose';
import { ILesson } from "./lesson.types";

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
    url: {
        type: String,
        required: true
    },
    description: String
}, { _id: false });

const lessonSchema = new Schema<ILesson>({
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
        ref: 'Course',
        required: true
    },
    order: {
        type: Number,
        required: true,
        min: 1
    },
    videoUrl: {
        type: String,
        validate: {
            validator: function(v: string) {
                return !v || /^https?:\/\/.+/.test(v);
            },
            message: 'URL видео должен быть валидным URL'
        }
    },
    resources: [lessonResourceSchema],
    inputExamples: String,
    outputExamples: String,
    tags: [{
        type: String,
        trim: true
    }],
    allowedUsers: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    timestamps: true // Автоматически добавляет createdAt и updatedAt
});

// Индекс для уникальности названия урока в рамках курса
lessonSchema.index({ title: 1, courseId: 1 }, { unique: true });

// Индекс для сортировки уроков в курсе
lessonSchema.index({ courseId: 1, order: 1 });

export const LessonModel = model<ILesson>('Lesson', lessonSchema);