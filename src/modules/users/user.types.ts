import { Types } from 'mongoose';

export type UserRole = 'student' | 'author' | 'admin';

export type User = {
    _id: Types.ObjectId;
    name: string;
    email: string;
    password?: string;
    googleId?: string;
    role: UserRole;
    avatar?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type NewUser = Omit<User, "_id" | "createdAt" | "updatedAt"> & {
    password: string;
};
export type UpdateUser = Partial<User>;