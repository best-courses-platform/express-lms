import { HydratedDocument, Types } from 'mongoose';

export type UserRole = 'student' | 'author' | 'admin';

export type User = {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password?: string;
  googleId?: string;
  githubId?: string;
  role: UserRole;
  avatar?: string;

  isEmailVerified: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpires?: Date | null;

  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;

  createdAt: Date;
  updatedAt: Date;
};

// Полный Mongoose-документ с методами .save(), .toObject(), методами схемы и т.д.
export type UserDocument = HydratedDocument<User>;

export type NewUser = Omit<User, '_id' | 'createdAt' | 'updatedAt'> & {
  password?: string;
  isEmailVerified?: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpires?: Date | null;
};

export type UpdateUser = Partial<User>;
