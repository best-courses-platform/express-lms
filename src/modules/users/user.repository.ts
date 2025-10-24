import { User, NewUser, UpdateUser } from "./user.types";
import { UserModel } from "./user.model";
import { Types } from 'mongoose';

class UserRepository {
    async create(input: NewUser): Promise<User> {
        const user = new UserModel(input);

        return await user.save();
    }

    async findAll(): Promise<User[]> {
        return await UserModel.find().select('-password').exec();
    }

    async findById(id: string): Promise<User | null> {
        if (!Types.ObjectId.isValid(id)) return null;

        return await UserModel.findById(id).select('-password').exec();
    }

    async findByEmail(email: string): Promise<User | null> {
        return await UserModel.findOne({ email: email.toLowerCase() }).exec();
    }

    // Этот метод нужен для аутентификации, где пароль требуется
    async findByEmailWithPassword(email: string): Promise<User | null> {
        return await UserModel.findOne({ email: email.toLowerCase() }).select('+password').exec();
    }

    async findByGoogleId(googleId: string): Promise<User | null> {
        return await UserModel.findOne({ googleId }).exec();
    }

    async update(id: string, patch: UpdateUser): Promise<User> {
        if (!Types.ObjectId.isValid(id)) {
            throw new Error('Invalid user ID');
        }

        const updatedUser = await UserModel.findByIdAndUpdate(
            id,
            { ...patch },
            { new: true, runValidators: true }
        ).select('-password').exec();

        if (!updatedUser) {
            throw new Error('User not found');
        }

        return updatedUser;
    }

    async delete(id: string): Promise<boolean> {
        if (!Types.ObjectId.isValid(id)) return false;

        const result = await UserModel.findByIdAndDelete(id).exec();

        return !!result;
    }
}

export const userRepository = new UserRepository();