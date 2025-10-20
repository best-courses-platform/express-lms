// src/users/__tests__/user.service.spec.ts
import { userService } from '../user.service';
import { userRepository } from '../user.repository';
import { AppError } from '../../../utils/errors';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { User, IUser } from '../user.types';
import { Types } from 'mongoose';

// Моки
jest.mock('../user.repository');

// Типизированный мок репозитория
const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;

// Вспомогательная функция для создания mock пользователя
const createMockUser = (overrides?: Partial<IUser>): IUser => ({
    _id: new Types.ObjectId(),
    name: 'Test User',
    email: 'test@example.com',
    role: 'student',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
} as IUser);

describe('User Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Создание пользователя', () => {
        describe('Когда email не занят', () => {
            it('должен создать нового пользователя', async () => {
                // Given
                const newUserData = {
                    name: 'Test User',
                    email: 'test@example.com',
                    password: 'password',
                    role: 'student' as const
                };

                const mockUser = createMockUser({
                    _id: new Types.ObjectId(),
                    ...newUserData
                });

                mockUserRepository.findByEmail.mockResolvedValue(null);
                mockUserRepository.create.mockResolvedValue(mockUser);

                // When
                const result = await userService.create(newUserData);

                // Then
                expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
                expect(mockUserRepository.create).toHaveBeenCalledWith(newUserData);
                expect(result).toEqual(mockUser);
            });
        });

        describe('Когда email уже занят', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                const newUserData = {
                    name: 'Test User',
                    email: 'existing@example.com',
                    password: 'password',
                    role: 'student' as const
                };

                const existingUser = createMockUser({
                    _id: new Types.ObjectId(),
                    ...newUserData
                });

                mockUserRepository.findByEmail.mockResolvedValue(existingUser);

                // When & Then
                await expect(userService.create(newUserData))
                    .rejects
                    .toThrow(new AppError(409, 'Email already in use'));
            });
        });
    });

    describe('Получение пользователя по ID', () => {
        describe('Когда пользователь существует', () => {
            it('должен вернуть пользователя', async () => {
                // Given
                const mockUser = createMockUser({
                    _id: new Types.ObjectId('123'),
                    name: 'Test User',
                    email: 'test@example.com',
                    password: 'password',
                });

                mockUserRepository.findById.mockResolvedValue(mockUser);

                // When
                const result = await userService.getById('123');

                // Then
                expect(mockUserRepository.findById).toHaveBeenCalledWith('123');
                expect(result).toEqual(mockUser);
            });
        });

        describe('Когда пользователь не найден', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                mockUserRepository.findById.mockResolvedValue(null);

                // When & Then
                await expect(userService.getById('nonexistent'))
                    .rejects
                    .toThrow(new AppError(404, 'User not found'));
            });
        });
    });


    describe('Обновление пользователя', () => {
        describe('Когда пользователь существует и email свободен', () => {
            it('должен обновить пользователя', async () => {
                // Given
                const existingUser = createMockUser({
                    _id: new Types.ObjectId('123'),
                    name: 'Old Name',
                    email: 'old@example.com',
                    password: 'password',
                });

                const updateData = {
                    name: 'New Name',
                    email: 'new@example.com'
                };

                const updatedUser = createMockUser({
                    ...existingUser,
                    ...updateData,
                    updatedAt: new Date()
                });

                mockUserRepository.findById.mockResolvedValue(existingUser);
                mockUserRepository.findByEmail.mockResolvedValue(null);
                mockUserRepository.update.mockResolvedValue(updatedUser);

                // When
                const result = await userService.update('123', updateData);

                // Then
                expect(mockUserRepository.findById).toHaveBeenCalledWith('123');
                expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('new@example.com');
                expect(mockUserRepository.update).toHaveBeenCalledWith('123', updateData);
                expect(result).toEqual(updatedUser);
            });
        });

        describe('Когда email уже занят другим пользователем', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                const existingUser = createMockUser({
                    _id: new Types.ObjectId('123'),
                    name: 'Current User',
                    email: 'current@example.com',
                    password: 'password',
                });

                const otherUser = createMockUser({
                    _id: new Types.ObjectId('456'),
                    name: 'Other User',
                    email: 'other@example.com'
                });

                const updateData = {
                    email: 'other@example.com'
                };

                mockUserRepository.findById.mockResolvedValue(existingUser);
                mockUserRepository.findByEmail.mockResolvedValue(otherUser);

                // When & Then
                await expect(userService.update('123', updateData))
                    .rejects
                    .toThrow(new AppError(409, 'Email already in use'));
            });
        });
    });
});
