import { model, Schema } from 'mongoose';
import { User, UserRole } from './user.types';
import bcrypt from 'bcryptjs';

const userSchema = new Schema<User>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      minlength: 6,
      // required только для локальной регистрации, не для OAuth
      required: function () {
        return !this.googleId && !this.githubId; // <-- обновляем условие
      },
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    githubId: {
      type: String,
      sparse: true,
      unique: true,
    },
    role: {
      type: String,
      enum: ['student', 'author', 'admin'] as UserRole[],
      default: 'student',
    },
    avatar: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true, // автоматически добавляет createdAt и updatedAt
  }
);

// Индексы для оптимизации запросов
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ githubId: 1 }); // <-- добавляем индекс для githubId
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

// Middleware для хеширования пароля перед сохранением
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: unknown) {
    next(error as Error);
  }
});

// Метод для проверки пароля
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) {
    return false;
  }

  return await bcrypt.compare(candidatePassword, this.password);
};

// Метод для преобразования пользователя в JSON (убираем пароль)
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

// Статические методы для поиска
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByGoogleId = function (googleId: string) {
  return this.findOne({ googleId });
};

userSchema.statics.findByGithubId = function (githubId: string) {
  // <-- добавляем метод
  return this.findOne({ githubId });
};

// Статический метод для поиска по любому OAuth провайдеру
userSchema.statics.findByOAuthProvider = function (provider: string, providerId: string) {
  if (provider === 'google') {
    return this.findOne({ googleId: providerId });
  } else if (provider === 'github') {
    return this.findOne({ githubId: providerId }); // <-- добавляем поиск по githubId
  }
  return null;
};

export const UserModel = model<User>('User', userSchema);
