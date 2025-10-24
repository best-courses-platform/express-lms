import { model, Schema } from 'mongoose';
import { IUser, UserRole } from "./user.types";
import bcrypt from 'bcryptjs';

const userSchema = new Schema<IUser>({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        minlength: 6,
        // required только для локальной регистрации, не для OAuth
        required: function() {
            return !this.googleId;
        }
    },
    googleId: {
        type: String,
        sparse: true,
        unique: true
    },
    role: {
        type: String,
        enum: ['student', 'author', 'admin'] as UserRole[],
        default: 'student'
    },
    avatar: {
        type: String,
        trim: true,
        default: null
    }
}, {
    timestamps: true // автоматически добавляет createdAt и updatedAt
});

// Индексы для оптимизации запросов
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

// Middleware для хеширования пароля перед сохранением
userSchema.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error: any) {
        next(error);
    }
});

// Метод для проверки пароля
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

// Метод для преобразования пользователя в JSON (убираем пароль)
userSchema.methods.toJSON = function() {
    const userObject = this.toObject();
    delete userObject.password;
    return userObject;
};

// Статический метод для поиска по email
userSchema.statics.findByEmail = function(email: string) {
    return this.findOne({ email: email.toLowerCase() });
};

// Статический метод для поиска по googleId
userSchema.statics.findByGoogleId = function(googleId: string) {
    return this.findOne({ googleId });
};

export const UserModel = model<IUser>('User', userSchema);