import { Request, Response, NextFunction } from 'express';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as CourseController from '../course.controller';
import { courseService } from '../course.service';
import { AppError } from '../../../utils/errors';
import { Types } from 'mongoose';

// Моки
jest.mock('../course.service');

// Типизированный мок сервиса
const mockCourseService = courseService as jest.Mocked<typeof courseService>;

describe('Course Controller', () => {
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

    describe('Создание курса', () => {
        describe('Когда переданы корректные данные', () => {
            it('должен создать курс и вернуть статус 201', async () => {
                // Given
                const mockCourse = {
                    _id: '123',
                    title: 'Test Course',
                    description: 'Test Description',
                    previewImage: 'test.jpg',
                    author: new Types.ObjectId(),
                    tags: ['javascript', 'typescript'],
                    difficulty: 'beginner' as const,
                    lessons: [],
                    ratings: [],
                    averageRating: 0,
                    isPublished: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                mockRequest.body = {
                    title: 'Test Course',
                    description: 'Test Description',
                    previewImage: 'test.jpg',
                    author: new Types.ObjectId(),
                    tags: ['javascript', 'typescript'],
                };

                mockCourseService.create.mockResolvedValue(mockCourse);

                // When
                await CourseController.createCourse(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockCourseService.create).toHaveBeenCalledWith(mockRequest.body);
                expect(mockResponse.status).toHaveBeenCalledWith(201);
                expect(mockResponse.json).toHaveBeenCalledWith(mockCourse);
            });
        });

        describe('Когда курс с таким названием уже существует', () => {
            it('должен вызвать ошибку с статусом 409', async () => {
                // Given
                mockRequest.body = {
                    title: 'Existing Course',
                    description: 'Test Description',
                    author: 'Test Author'
                };

                const mockError = new AppError(409, 'This course already exists');
                mockCourseService.create.mockRejectedValue(mockError);

                // When
                await CourseController.createCourse(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Получение списка курсов', () => {
        describe('Когда курсы существуют', () => {
            it('должен вернуть список курсов', async () => {
                // Given
                const mockCourses = [
                    {
                        _id: '1',
                        title: 'Course 1',
                        description: 'Description 1',
                        previewImage: 'image1.jpg',
                        author: new Types.ObjectId(),
                        tags: ['javascript'],
                        difficulty: 'beginner' as const,
                        lessons: [],
                        ratings: [],
                        averageRating: 0,
                        isPublished: false,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    },
                    {
                        _id: '2',
                        title: 'Course 2',
                        description: 'Description 2',
                        previewImage: 'image2.jpg',
                        author: new Types.ObjectId(),
                        tags: ['typescript'],
                        difficulty: 'beginner' as const,
                        lessons: [],
                        ratings: [],
                        averageRating: 0,
                        isPublished: false,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                ];

                mockCourseService.list.mockResolvedValue(mockCourses);

                // When
                await CourseController.listCourse(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockCourseService.list).toHaveBeenCalled();
                expect(mockResponse.json).toHaveBeenCalledWith(mockCourses);
            });
        });

        describe('Когда возникает ошибка при получении списка', () => {
            it('должен вызвать next с ошибкой', async () => {
                // Given
                const mockError = new Error('Database error');
                mockCourseService.list.mockRejectedValue(mockError);

                // When
                await CourseController.listCourse(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Получение курса по ID', () => {
        describe('Когда курс существует', () => {
            it('должен вернуть курс', async () => {
                // Given
                const mockCourse = {
                    _id: '123',
                    title: 'Test Course',
                    description: 'Test Description',
                    previewImage: 'test.jpg',
                    author: new Types.ObjectId(),
                    tags: ['javascript'],
                    difficulty: 'beginner' as const,
                    lessons: [],
                    ratings: [],
                    averageRating: 0,
                    isPublished: false,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                mockRequest.params = { id: '123' };
                mockCourseService.getById.mockResolvedValue(mockCourse);

                // When
                await CourseController.getCourse(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockCourseService.getById).toHaveBeenCalledWith('123');
                expect(mockResponse.json).toHaveBeenCalledWith(mockCourse);
            });
        });

        describe('Когда курс не найден', () => {
            it('должен вызвать ошибку с статусом 404', async () => {
                // Given
                mockRequest.params = { id: 'nonexistent' };
                const mockError = new AppError(404, 'Course not found');
                mockCourseService.getById.mockRejectedValue(mockError);

                // When
                await CourseController.getCourse(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Обновление курса', () => {
        describe('Когда курс существует и данные валидны', () => {
            it('должен обновить курс и вернуть обновленные данные', async () => {
                // Given
                const mockUpdatedCourse = {
                    _id: '123',
                    title: 'Updated Course',
                    description: 'Updated Description',
                    previewImage: 'updated.jpg',
                    author: new Types.ObjectId(),
                    tags: ['react'],
                    difficulty: 'beginner' as const,
                    lessons: [],
                    ratings: [],
                    averageRating: 0,
                    isPublished: false,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                mockRequest.params = { id: '123' };
                mockRequest.body = { title: 'Updated Course' };
                mockCourseService.update.mockResolvedValue(mockUpdatedCourse);

                // When
                await CourseController.updateCourse(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockCourseService.update).toHaveBeenCalledWith('123', { title: 'Updated Course' });
                expect(mockResponse.json).toHaveBeenCalledWith(mockUpdatedCourse);
            });
        });

        describe('Когда название уже используется другим курсом', () => {
            it('должен вызвать ошибку с статусом 409', async () => {
                // Given
                mockRequest.params = { id: '123' };
                mockRequest.body = { title: 'Existing Course' };
                const mockError = new AppError(409, 'This course already exists');
                mockCourseService.update.mockRejectedValue(mockError);

                // When
                await CourseController.updateCourse(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Удаление курса', () => {
        describe('Когда курс существует', () => {
            it('должен удалить курс и вернуть статус 204', async () => {
                // Given
                mockRequest.params = { id: '123' };
                mockCourseService.delete.mockResolvedValue(undefined);

                // When
                await CourseController.deleteCourse(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockCourseService.delete).toHaveBeenCalledWith('123');
                expect(mockResponse.status).toHaveBeenCalledWith(204);
                expect(mockResponse.send).toHaveBeenCalled();
            });
        });

        describe('Когда курс не найден', () => {
            it('должен вызвать ошибку с статусом 404', async () => {
                // Given
                mockRequest.params = { id: 'nonexistent' };
                const mockError = new AppError(404, 'Course not found');
                mockCourseService.delete.mockRejectedValue(mockError);

                // When
                await CourseController.deleteCourse(
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