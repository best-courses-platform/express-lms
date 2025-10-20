import { Request, Response, NextFunction } from 'express';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as LessonController from '../lesson.controller';
import { lessonService } from '../lesson.service';
import { AppError } from '../../../utils/errors';
import { Types } from 'mongoose';

// Моки
jest.mock('../lesson.service');

// Типы для моков
const mockLessonService = lessonService as jest.Mocked<typeof lessonService>;

describe('Lesson Controller', () => {
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
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        };
        mockNext = jest.fn();

        jest.clearAllMocks();
    });

    describe('Создание урока', () => {
        describe('Когда переданы корректные данные', () => {
            it('должен создать урок и вернуть статус 201', async () => {
                // Given
                const mockLesson = {
                    _id: new Types.ObjectId(),
                    title: 'Test Lesson',
                    description: 'Test Description',
                    courseId: new Types.ObjectId(),
                    order: 1,
                    videoUrl: 'https://example.com/video.mp4',
                    resources: [],
                    inputExamples: 'Input examples',
                    outputExamples: 'Output examples',
                    tags: ['algorithm', 'programming'],
                    allowedUsers: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                mockRequest.body = {
                    title: 'Test Lesson',
                    description: 'Test Description',
                    courseId: new Types.ObjectId(),
                    order: 1,
                    tags: ['algorithm', 'programming']
                };

                mockLessonService.create.mockResolvedValue(mockLesson);

                // When
                await LessonController.createLesson(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockLessonService.create).toHaveBeenCalledWith(mockRequest.body);
                expect(mockResponse.status).toHaveBeenCalledWith(201);
                expect(mockResponse.json).toHaveBeenCalledWith(mockLesson);
            });
        });

        describe('Когда урок с таким названием уже существует в курсе', () => {
            it('должен вызвать ошибку с статусом 409', async () => {
                // Given
                mockRequest.body = {
                    title: 'Existing Lesson',
                    description: 'Test Description',
                    courseId: new Types.ObjectId(),
                    order: 1
                };

                const mockError = new AppError(409, 'Урок с таким названием уже существует в этом курсе');
                mockLessonService.create.mockRejectedValue(mockError);

                // When
                await LessonController.createLesson(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Получение списка уроков', () => {
        describe('Когда уроки существуют', () => {
            it('должен вернуть список уроков', async () => {
                // Given
                const mockLessons = [
                    {
                        _id: new Types.ObjectId(),
                        title: 'Lesson 1',
                        description: 'Description 1',
                        courseId: new Types.ObjectId(),
                        order: 1,
                        tags: ['tag1'],
                        allowedUsers: [],
                        createdAt: new Date(),
                        updatedAt: new Date()
                    },
                    {
                        _id: new Types.ObjectId(),
                        title: 'Lesson 2',
                        description: 'Description 2',
                        courseId: new Types.ObjectId(),
                        order: 2,
                        tags: ['tag2'],
                        allowedUsers: [],
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                ];

                mockLessonService.list.mockResolvedValue(mockLessons);

                // When
                await LessonController.listLessons(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockLessonService.list).toHaveBeenCalled();
                expect(mockResponse.json).toHaveBeenCalledWith(mockLessons);
            });
        });

        describe('Когда возникает ошибка при получении списка', () => {
            it('должен вызвать next с ошибкой', async () => {
                // Given
                const mockError = new Error('Database error');
                mockLessonService.list.mockRejectedValue(mockError);

                // When
                await LessonController.listLessons(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Получение урока по ID', () => {
        describe('Когда урок существует', () => {
            it('должен вернуть урок', async () => {
                // Given
                const mockLesson = {
                    _id: new Types.ObjectId(),
                    title: 'Test Lesson',
                    description: 'Test Description',
                    courseId: new Types.ObjectId(),
                    order: 1,
                    tags: ['algorithm'],
                    allowedUsers: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                mockRequest.params = { id: '123' };
                mockLessonService.getById.mockResolvedValue(mockLesson);

                // When
                await LessonController.getLesson(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockLessonService.getById).toHaveBeenCalledWith('123');
                expect(mockResponse.json).toHaveBeenCalledWith(mockLesson);
            });
        });

        describe('Когда урок не найден', () => {
            it('должен вызвать ошибку с статусом 404', async () => {
                // Given
                mockRequest.params = { id: 'nonexistent' };
                const mockError = new AppError(404, 'Урок не найден');
                mockLessonService.getById.mockRejectedValue(mockError);

                // When
                await LessonController.getLesson(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Обновление урока', () => {
        describe('Когда урок существует и данные валидны', () => {
            it('должен обновить урок и вернуть обновленные данные', async () => {
                // Given
                const mockUpdatedLesson = {
                    _id: new Types.ObjectId(),
                    title: 'Updated Lesson',
                    description: 'Updated Description',
                    courseId: new Types.ObjectId(),
                    order: 1,
                    tags: ['updated'],
                    allowedUsers: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                mockRequest.params = { id: '123' };
                mockRequest.body = { title: 'Updated Lesson' };
                mockLessonService.update.mockResolvedValue(mockUpdatedLesson);

                // When
                await LessonController.updateLesson(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockLessonService.update).toHaveBeenCalledWith('123', {
                    title: 'Updated Lesson',
                });
                expect(mockResponse.json).toHaveBeenCalledWith(mockUpdatedLesson);
            });
        });

        describe('Когда название урока уже используется в этом курсе', () => {
            it('должен вызвать ошибку с статусом 409', async () => {
                // Given
                mockRequest.params = { id: '123' };
                mockRequest.body = { title: 'Existing Lesson' };
                const mockError = new AppError(409, 'Урок с таким названием уже существует в этом курсе');
                mockLessonService.update.mockRejectedValue(mockError);

                // When
                await LessonController.updateLesson(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Удаление урока', () => {
        describe('Когда урок существует', () => {
            it('должен удалить урок и вернуть статус 204', async () => {
                // Given
                mockRequest.params = { id: '123' };
                mockLessonService.delete.mockResolvedValue(undefined);

                // When
                await LessonController.deleteLesson(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockLessonService.delete).toHaveBeenCalledWith('123');
                expect(mockResponse.status).toHaveBeenCalledWith(204);
                expect(mockResponse.send).toHaveBeenCalled();
            });
        });

        describe('Когда урок не найден', () => {
            it('должен вызвать ошибку с статусом 404', async () => {
                // Given
                mockRequest.params = { id: 'nonexistent' };
                const mockError = new AppError(404, 'Урок не найден');
                mockLessonService.delete.mockRejectedValue(mockError);

                // When
                await LessonController.deleteLesson(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockNext).toHaveBeenCalledWith(mockError);
            });
        });
    });

    describe('Получение уроков по курсу', () => {
        describe('Когда курс существует и имеет уроки', () => {
            it('должен вернуть список уроков курса', async () => {
                // Given
                const courseId = new Types.ObjectId();
                const mockLessons = [
                    {
                        _id: new Types.ObjectId(),
                        title: 'Course Lesson 1',
                        description: 'Description 1',
                        courseId: courseId,
                        order: 1,
                        tags: ['course-tag'],
                        allowedUsers: [],
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                ];

                mockRequest.params = { courseId: courseId.toString() };
                mockLessonService.getByCourseId.mockResolvedValue(mockLessons);

                // When
                await LessonController.getLessonsByCourse(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockLessonService.getByCourseId).toHaveBeenCalledWith(courseId.toString());
                expect(mockResponse.json).toHaveBeenCalledWith(mockLessons);
            });
        });
    });

    describe('Проверка доступа пользователя к уроку', () => {
        describe('Когда пользователь имеет доступ', () => {
            it('должен вернуть true', async () => {
                // Given
                mockRequest.params = { lessonId: '123', userId: '456' };
                mockLessonService.checkUserAccess.mockResolvedValue(true);

                // When
                await LessonController.checkLessonAccess(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockLessonService.checkUserAccess).toHaveBeenCalledWith('123', '456');
                expect(mockResponse.json).toHaveBeenCalledWith({ hasAccess: true });
            });
        });

        describe('Когда пользователь не имеет доступ', () => {
            it('должен вернуть false', async () => {
                // Given
                mockRequest.params = { lessonId: '123', userId: '456' };
                mockLessonService.checkUserAccess.mockResolvedValue(false);

                // When
                await LessonController.checkLessonAccess(
                    mockRequest as Request,
                    mockResponse as unknown as Response,
                    mockNext as unknown as NextFunction
                );

                // Then
                expect(mockResponse.json).toHaveBeenCalledWith({ hasAccess: false });
            });
        });
    });
});