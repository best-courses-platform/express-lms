import { model, Schema, Types } from 'mongoose';
import { ICourse } from "./course.types";

const ratingSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    value: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const courseSchema = new Schema<ICourse>({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    previewImage: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    tags: [{
        type: String,
        trim: true,
        maxlength: 30
    }],
    difficulty: {
        type: String,
        required: true,
        enum: ['beginner', 'intermediate', 'advanced'],
        default: 'beginner'
    },
    lessons: [{
        type: Schema.Types.ObjectId,
        ref: 'Lesson'
    }],
    ratings: [ratingSchema],
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    isPublished: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true // автоматически добавляет createdAt и updatedAt
});

// Индексы для оптимизации запросов
courseSchema.index({ title: 'text', description: 'text' });
courseSchema.index({ author: 1 });
courseSchema.index({ difficulty: 1 });
courseSchema.index({ isPublished: 1 });
courseSchema.index({ averageRating: -1 });
courseSchema.index({ createdAt: -1 });

// Middleware для пересчета averageRating при изменении рейтингов
courseSchema.pre('save', function(next) {
    if (this.ratings.length > 0) {
        const total = this.ratings.reduce((sum, rating) => sum + rating.value, 0);
        this.averageRating = Math.round((total / this.ratings.length) * 10) / 10;
    } else {
        this.averageRating = 0;
    }
    next();
});

export const CourseModel = model<ICourse>('Course', courseSchema);