import request from 'supertest';
import express from 'express';
import lessonRoutes from '../lesson.routes';
import { describe, it, expect, beforeAll, jest, beforeEach } from '@jest/globals';
import { lessonService } from '../lesson.service';

// Моки
jest.mock('../lesson.service');

const mockLessonService = lessonService as jest.Mocked<typeof lessonService>;

describe('Lesson Routes', () => {
    let app: express.Application;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/lessons', lessonRoutes);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /lessons', () => {
        describe('Когда переданы корректные данные', () => {
            it('должен создать урок', async () => {
                // Given
                const lessonData = {
                    title: 'New Lesson',
                    description: 'Lesson Description',
                    courseId: '507f1f77bcf86cd799439011',
                    order: 1,
                    difficulty: 'beginner',
                    tags: ['programming']
                };

                const mockLesson = {
                    _id: '507f1f77bcf86cd799439012',
                    ...lessonData,
                    allowedUsers: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                mockLessonService.create.mockResolvedValue(mockLesson as any);

                // When
                const response = await request(app)
                    .post('/lessons')
                    .send(lessonData);

                // Then
                expect(response.status).toBe(201);
                expect(response.body).toHaveProperty('_id');
                expect(response.body.title).toBe(lessonData.title);
                expect(response.body.description).toBe(lessonData.description);
            });
        });

        describe('Когда урок с таким названием уже существует в курсе', () => {
            it('должен вернуть ошибку 409', async () => {
                // Given
                const lessonData = {
                    title: 'Duplicate Lesson',
                    description: 'Lesson Description',
                    courseId: '507f1f77bcf86cd799439011',
                    order: 1,
                    difficulty: 'beginner'
                };

                mockLessonService.create.mockRejectedValue({
                    statusCode: 409,
                    message: 'Урок с таким названием уже существует в этом курсе'
                });

                // When
                const response = await request(app)
                    .post('/lessons')
                    .send(lessonData);

                // Then
                expect(response.status).toBe(409);
            });
        });

        describe('Когда данные невалидны', () => {
            it('должен вернуть ошибку 400 при отсутствии courseId', async () => {
                // Given
                const invalidData = {
                    title: 'Invalid Lesson',
                    description: 'Lesson Description',
                    order: 1,
                    difficulty: 'beginner'
                };

                // When
                const response = await request(app)
                    .post('/lessons')
                    .send(invalidData);

                // Then
                expect(response.status).toBe(400);
            });
        });
    });

    describe('GET /lessons', () => {
        describe('Когда уроки существуют', () => {
            it('должен вернуть список уроков', async () => {
                // Given
                const mockLessons = [
                    {
                        _id: '1',
                        title: 'Lesson 1',
                        description: 'Description 1',
                        courseId: 'course1',
                        order: 1,
                        difficulty: 'beginner',
                        tags: ['tag1'],
                        allowedUsers: [],
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                ];

                mockLessonService.list.mockResolvedValue(mockLessons as any);

                // When
                const response = await request(app).get('/lessons');

                // Then
                expect(response.status).toBe(200);
                expect(Array.isArray(response.body)).toBe(true);
                expect(response.body).toHaveLength(1);
            });
        });
    });

    describe('GET /lessons/:id', () => {
        describe('Когда урок существует', () => {
            it('должен вернуть урок', async () => {
                // Given
                const lessonId = '507f1f77bcf86cd799439012';
                const mockLesson = {
                    _id: lessonId,
                    title: 'Test Lesson',
                    description: 'Test Description',
                    courseId: '507f1f77bcf86cd799439011',
                    order: 1,
                    difficulty: 'beginner',
                    tags: ['test'],
                    allowedUsers: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                mockLessonService.getById.mockResolvedValue(mockLesson as any);

                // When
                const response = await request(app).get(`/lessons/${lessonId}`);

                // Then
                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('_id', lessonId);
            });
        });

        describe('Когда урок не найден', () => {
            it('должен вернуть ошибку 404', async () => {
                // Given
                const nonExistentId = 'nonexistent-id';

                mockLessonService.getById.mockRejectedValue({
                    statusCode: 404,
                    message: 'Урок не найден'
                });

                // When
                const response = await request(app).get(`/lessons/${nonExistentId}`);

                // Then
                expect(response.status).toBe(404);
            });
        });
    });

    describe('GET /lessons/course/:courseId', () => {
        describe('Когда курс имеет уроки', () => {
            it('должен вернуть уроки курса', async () => {
                // Given
                const courseId = '507f1f77bcf86cd799439011';
                const mockLessons = [
                    {
                        _id: '1',
                        title: 'Course Lesson',
                        description: 'Description',
                        courseId: courseId,
                        order: 1,
                        difficulty: 'beginner',
                        tags: ['course'],
                        allowedUsers: [],
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                ];

                mockLessonService.getByCourseId.mockResolvedValue(mockLessons as any);

                // When
                const response = await request(app).get(`/lessons/course/${courseId}`);

                // Then
                expect(response.status).toBe(200);
                expect(Array.isArray(response.body)).toBe(true);
                expect(response.body[0].courseId).toBe(courseId);
            });
        });
    });

    describe('PATCH /lessons/:id', () => {
        describe('Когда урок существует и данные валидны', () => {
            it('должен обновить урок', async () => {
                // Given
                const lessonId = '507f1f77bcf86cd799439012';
                const updateData = {
                    title: 'Updated Lesson',
                    difficulty: 'advanced'
                };

                const mockUpdatedLesson = {
                    _id: lessonId,
                    title: 'Updated Lesson',
                    description: 'Original Description',
                    courseId: '507f1f77bcf86cd799439011',
                    order: 1,
                    difficulty: 'advanced',
                    tags: ['updated'],
                    allowedUsers: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                mockLessonService.update.mockResolvedValue(mockUpdatedLesson as any);

                // When
                const response = await request(app)
                    .patch(`/lessons/${lessonId}`)
                    .send(updateData);

                // Then
                expect(response.status).toBe(200);
                expect(response.body.title).toBe(updateData.title);
                expect(response.body.difficulty).toBe(updateData.difficulty);
            });
        });
    });

    describe('DELETE /lessons/:id', () => {
        describe('Когда урок существует', () => {
            it('должен удалить урок', async () => {
                // Given
                const lessonId = '507f1f77bcf86cd799439012';

                mockLessonService.delete.mockResolvedValue(undefined);

                // When
                const response = await request(app).delete(`/lessons/${lessonId}`);

                // Then
                expect(response.status).toBe(204);
            });
        });
    });

    describe('GET /lessons/:lessonId/access/:userId', () => {
        describe('Когда пользователь имеет доступ к уроку', () => {
            it('должен вернуть true', async () => {
                // Given
                const lessonId = '507f1f77bcf86cd799439012';
                const userId = '507f1f77bcf86cd799439013';

                mockLessonService.checkUserAccess.mockResolvedValue(true);

                // When
                const response = await request(app).get(`/lessons/${lessonId}/access/${userId}`);

                // Then
                expect(response.status).toBe(200);
                expect(response.body).toEqual({ hasAccess: true });
            });
        });
    });
});