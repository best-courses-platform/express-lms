import { User, NewUser, UpdateUser } from "./user.types";
import { userRepository } from "./user.repository";
import { AppError } from "../../utils/errors";

class UserService {
    async create(input: NewUser): Promise<User> {
        const normalizedEmail = input.email.toLowerCase().trim();
        const exists = await userRepository.findByEmail(normalizedEmail);

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
            const isTaken = await userRepository.isEmailTaken(patch.email, id);

            if (isTaken) throw new AppError(409, "Email already in use");
        }

        return userRepository.update(id, patch);
    }

    async delete(id: string): Promise<void> {
        const ok = await userRepository.delete(id);

        if (!ok) throw new AppError(404, "User not found");
    }

    // Новый метод для аутентификации
    async authenticate(email: string, password: string): Promise<User> {
        const user = await userRepository.findByEmailWithPassword(email);

        if (!user) throw new AppError(401, "Invalid credentials");

        // Используем метод comparePassword из модели
        const isValidPassword = await (user as any).comparePassword(password);
        if (!isValidPassword) throw new AppError(401, "Invalid credentials");

        // Возвращаем пользователя без пароля
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword as User;
    }

    // Метод для поиска/создания пользователя через OAuth
    async findOrCreateFromOAuth(profile: any): Promise<User> {
        let user = await userRepository.findByGoogleId(profile.id);

        if (!user) {
            // Создаем нового пользователя для OAuth
            user = await userRepository.create({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,
                avatar: profile.photos[0].value,
                role: 'student'
            } as NewUser);
        }

        return user;
    }
}

export const userService = new UserService();