import { User, NewUser, UpdateUser } from "./user.types";
import { userRepository } from "./user.repository";
import { AppError } from "../../utils/errors";

 class UserService {
    async create(input: NewUser): Promise<User> {
        const exists = await userRepository.findByEmail(input.email);

        if (exists) throw new AppError(409, "Email already in use");

        return userRepository.create(input);
    }

    async list(): Promise<User[]> {
        return userRepository.findAll();
    }

    async getById(id: string): Promise<User> {
        const user = await userRepository.findById(id);

        if (!user) throw new AppError(404, "User not found");

        return user;
    }

    async update(id: string, patch: UpdateUser): Promise<User> {
        const user = await userRepository.findById(id);

        if (!user) throw new AppError(404, "User not found");

        if (patch.email && patch.email !== user.email) {
            const exists = await userRepository.findByEmail(patch.email);

            if (exists) throw new AppError(409, "Email already in use");
        }

        return userRepository.update(id, patch);
    }

    async delete(id: string): Promise<void> {
        const ok = await userRepository.delete(id);

        if (!ok) throw new AppError(404, "User not found");
    }
}

export const userService = new UserService();