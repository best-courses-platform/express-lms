import { randomUUID } from "crypto";
import { User, NewUser, UpdateUser } from "./user.types";

const createStubUser = (overrides?: Partial<User>): User => ({
    _id: randomUUID() as string,
    name: "Stub User",
    email: "stub@example.com",
    role: "student",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
} as User);

class UserRepository {
    async create(input: NewUser): Promise<User> {
        return createStubUser(input);
    }

    async findAll(): Promise<User[]> {
        return [createStubUser()]
    }

    async findById(id: string): Promise<User | null> {
        return null
    }

    async findByEmail(email: string): Promise<User | null> {
        return null
    }

    async update(id: string, patch: UpdateUser): Promise<User> {
        return createStubUser()
    }

    async delete(id: string): Promise<boolean> {
        return true;
    }
}

export const userRepository = new UserRepository();