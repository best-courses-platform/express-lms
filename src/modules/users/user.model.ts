import { model, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { IUser, IUserMethods, UserModelType } from './user.types';

// Определяем схему с правильными типами
const userSchema = new Schema<IUser, UserModelType, IUserMethods>(
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
      required: function (this: IUser) {
        return !this.googleId && !this.githubId;
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
      enum: ['student', 'author', 'admin'],
      default: 'student',
    },
    avatar: {
      type: String,
      trim: true,
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
    },
    emailVerificationExpires: {
      type: Date,
      default: null,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// === ИНДЕКСЫ ===
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ githubId: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ isEmailVerified: 1 });
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

// === МЕТОДЫ ЭКЗЕМПЛЯРА ===
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.canPerformAction = function (): boolean {
  return this.isEmailVerified || this.role === 'admin';
};

userSchema.methods.generateEmailVerificationToken = function (): void {
  this.emailVerificationToken = crypto.randomBytes(32).toString('hex');
  this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
};

userSchema.methods.generatePasswordResetToken = function (): void {
  this.passwordResetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
};

// === MIDDLEWARE ===
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

// === СТАТИЧЕСКИЕ МЕТОДЫ ===
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByEmailWithPassword = function (email: string) {
  return this.findOne({ email: email.toLowerCase() }).select('+password');
};

userSchema.statics.findByGoogleId = function (googleId: string) {
  return this.findOne({ googleId });
};

userSchema.statics.findByGithubId = function (githubId: string) {
  return this.findOne({ githubId });
};

userSchema.statics.findByEmailVerificationToken = function (token: string) {
  return this.findOne({
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: new Date() },
  });
};

userSchema.statics.findByPasswordResetToken = function (token: string) {
  return this.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: new Date() },
  });
};

userSchema.statics.findByOAuthProvider = function (provider: string, providerId: string) {
  if (provider === 'google') {
    return this.findOne({ googleId: providerId });
  } else if (provider === 'github') {
    return this.findOne({ githubId: providerId });
  }
  return null;
};

// === JSON СЕРИАЛИЗАЦИЯ ===
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();

  delete userObject.password;
  delete userObject.emailVerificationToken;
  delete userObject.emailVerificationExpires;
  delete userObject.passwordResetToken;
  delete userObject.passwordResetExpires;

  return userObject;
};

// Создаем модель с правильными типами
export const UserModel = model<IUser, UserModelType>('User', userSchema);
