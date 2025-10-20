import { Request, Response, NextFunction } from 'express';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as UserController from '../user.controller';
import { userService } from '../user.service';
import { AppError } from '../../../utils/errors';

// Моки
jest.mock('../user.service');

// Типы для моков
const mockUserService = userService as jest.Mocked<typeof userService>;

describe('User Controller', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: {
        json: jest.Mock;
        status: jest.Mock;
        send: jest.Mock;
    };
    let mockNext: jest.Mock;

    beforeEach(() => {
        mockRequest = {};
        mockResponse = {
            json: jest.fn(),
            status: jest.fn().mockReturnValue({ json: jest.fn() }),
            send: jest.fn()
        };
        mockNext = jest.fn();

        jest.clearAllMocks();
    });

    describe('Создание пользователя', () => {
        describe('Когда переданы корректные данные', () => {
            it('должен создать пользователя и вернуть статус 201', async () => {
                // Given
                const mockUser = {
                    _id: '123',
                    name: 'Test User',
                    email: 'test@example.com',
                    password: 'password',
                    role: 'student' as const,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                mockRequest.body = {
                    name: 'Test User',
                    email: 'test@example.com',
                    role: 'student'
                };

                mockUserService.create.mockResolvedValue(mockUser);

                // When
                await UserController.createUser(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockUserService.create).toHaveBeenCalledWith(mockRequest.body);
                expect(mockResponse.status).toHaveBeenCalledWith(201);
                expect(mockResponse.json).toHaveBeenCalledWith(mockUser);
            });
        });

        describe('Когда email уже используется', () => {
            it('должен вызвать ошибку с статусом 409', async () => {
                // Given
                mockRequest.body = {
                    name: 'Test User',
                    email: 'existing@example.com',
                    role: 'student'
                };

                const mockError = new AppError(409, 'Email already in use');
                mockUserService.create.mockRejectedValue(mockError);

                // When
                await UserController.createUser(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Получение списка пользователей', () => {
        describe('Когда пользователи существуют', () => {
            it('должен вернуть список пользователей', async () => {
                // Given
                const mockUsers = [
                    {
                        _id: '1',
                        name: 'User 1',
                        email: 'user1@example.com',
                        role: 'student' as const,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    },
                    {
                        _id: '2',
                        name: 'User 2',
                        email: 'user2@example.com',
                        role: 'author' as const,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                ];

                mockUserService.list.mockResolvedValue(mockUsers);

                // When
                await UserController.listUsers(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockUserService.list).toHaveBeenCalled();
                expect(mockResponse.json).toHaveBeenCalledWith(mockUsers);
            });
        });

        describe('Когда возникает ошибка при получении списка', () => {
            it('должен вызвать next с ошибкой', async () => {
                // Given
                const mockError = new Error('Database error');
                mockUserService.list.mockRejectedValue(mockError);

                // When
                await UserController.listUsers(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Получение пользователя по ID', () => {
        describe('Когда пользователь существует', () => {
            it('должен вернуть пользователя', async () => {
                // Given
                const mockUser = {
                    _id: '123',
                    name: 'Test User',
                    email: 'test@example.com',
                    role: 'student' as const,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                mockRequest.params = { id: '123' };
                mockUserService.getById.mockResolvedValue(mockUser);

                // When
                await UserController.getUser(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockUserService.getById).toHaveBeenCalledWith('123');
                expect(mockResponse.json).toHaveBeenCalledWith(mockUser);
            });
        });

        describe('Когда пользователь не найден', () => {
            it('должен вызвать ошибку с статусом 404', async () => {
                // Given
                mockRequest.params = { id: 'nonexistent' };
                const mockError = new AppError(404, 'User not found');
                mockUserService.getById.mockRejectedValue(mockError);

                // When
                await UserController.getUser(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Обновление пользователя', () => {
        describe('Когда пользователь существует и данные валидны', () => {
            it('должен обновить пользователя и вернуть обновленные данные', async () => {
                // Given
                const mockUpdatedUser = {
                    _id: '123',
                    name: 'Updated User',
                    email: 'updated@example.com',
                    role: 'student' as const,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                mockRequest.params = { id: '123' };
                mockRequest.body = { name: 'Updated User' };
                mockUserService.update.mockResolvedValue(mockUpdatedUser);

                // When
                await UserController.updateUser(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockUserService.update).toHaveBeenCalledWith('123', { name: 'Updated User' });
                expect(mockResponse.json).toHaveBeenCalledWith(mockUpdatedUser);
            });
        });

        describe('Когда email уже используется другим пользователем', () => {
            it('должен вызвать ошибку с статусом 409', async () => {
                // Given
                mockRequest.params = { id: '123' };
                mockRequest.body = { email: 'existing@example.com' };
                const mockError = new AppError(409, 'Email already in use');
                mockUserService.update.mockRejectedValue(mockError);

                // When
                await UserController.updateUser(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Удаление пользователя', () => {
        describe('Когда пользователь существует', () => {
            it('должен удалить пользователя и вернуть статус 204', async () => {
                // Given
                mockRequest.params = { id: '123' };
                mockUserService.delete.mockResolvedValue(undefined);

                // When
                await UserController.deleteUser(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockUserService.delete).toHaveBeenCalledWith('123');
                expect(mockResponse.status).toHaveBeenCalledWith(204);
                expect(mockResponse.send).toHaveBeenCalled();
            });
        });

        describe('Когда пользователь не найден', () => {
            it('должен вызвать ошибку с статусом 404', async () => {
                // Given
                mockRequest.params = { id: 'nonexistent' };
                const mockError = new AppError(404, 'User not found');
                mockUserService.delete.mockRejectedValue(mockError);

                // When
                await UserController.deleteUser(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });
});