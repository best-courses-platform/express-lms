import { Document, Types } from 'mongoose';

export type UserRole = 'student' | 'author' | 'admin';

export type User = {
    name: string;
    email: string;
    password?: string;
    googleId?: string;
    role: UserRole;
    avatar?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type NewUser = Omit<User, "createdAt" | "updatedAt"> & {
    password: string;
};
export type UpdateUser = Partial<User>;

export interface IUser extends User, Document {
    _id: Types.ObjectId;
}