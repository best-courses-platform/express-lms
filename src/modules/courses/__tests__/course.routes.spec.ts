import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import courseRoutes from '../course.routes';

describe('Course Routes', () => {
    let app: express.Application;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/courses', courseRoutes);
    });

    describe('POST /courses', () => {
        describe('Когда переданы корректные данные', () => {
            it('должен создать курс', async () => {
                // Given
                const courseData = {
                    title: 'New Course',
                    description: 'New Description',
                    previewImage: 'image.jpg',
                    author: 'Test Author',
                    tags: ['javascript']
                };

                // When
                const response = await request(app)
                    .post('/courses')
                    .send(courseData);

                // Then
                expect(response.status).toBe(201);
                expect(response.body).toHaveProperty('_id');
                expect(response.body.title).toBe(courseData.title);
                expect(response.body.description).toBe(courseData.description);
            });
        });

        describe('Когда курс с таким названием уже существует', () => {
            it('должен вернуть ошибку 409', async () => {
                // Given
                const courseData = {
                    title: 'Existing Course',
                    description: 'Description',
                    author: 'Author'
                };

                // When
                const response = await request(app)
                    .post('/courses')
                    .send(courseData);

                // Then
                expect(response.status).toBe(409);
            });
        });
    });

    describe('GET /courses', () => {
        describe('Когда курсы существуют', () => {
            it('должен вернуть список курсов', async () => {
                // When
                const response = await request(app).get('/courses');

                // Then
                expect(response.status).toBe(200);
                expect(Array.isArray(response.body)).toBe(true);
            });
        });
    });

    describe('GET /courses/:id', () => {
        describe('Когда курс существует', () => {
            it('должен вернуть курс', async () => {
                // Given
                const courseId = 'existing-course-id';

                // When
                const response = await request(app).get(`/courses/${courseId}`);

                // Then
                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('_id', courseId);
            });
        });

        describe('Когда курс не найден', () => {
            it('должен вернуть ошибку 404', async () => {
                // Given
                const nonExistentId = 'non-existent-id';

                // When
                const response = await request(app).get(`/courses/${nonExistentId}`);

                // Then
                expect(response.status).toBe(404);
            });
        });
    });

    describe('PATCH /courses/:id', () => {
        describe('Когда курс существует и данные валидны', () => {
            it('должен обновить курс', async () => {
                // Given
                const courseId = 'existing-course-id';
                const updateData = {
                    title: 'Updated Title'
                };

                // When
                const response = await request(app)
                    .patch(`/courses/${courseId}`)
                    .send(updateData);

                // Then
                expect(response.status).toBe(200);
                expect(response.body.title).toBe(updateData.title);
            });
        });

        describe('Когда название уже используется', () => {
            it('должен вернуть ошибку 409', async () => {
                // Given
                const courseId = 'existing-course-id';
                const updateData = {
                    title: 'Existing Course'
                };

                // When
                const response = await request(app)
                    .patch(`/courses/${courseId}`)
                    .send(updateData);

                // Then
                expect(response.status).toBe(409);
            });
        });
    });

    describe('DELETE /courses/:id', () => {
        describe('Когда курс существует', () => {
            it('должен удалить курс', async () => {
                // Given
                const courseId = 'existing-course-id';

                // When
                const response = await request(app).delete(`/courses/${courseId}`);

                // Then
                expect(response.status).toBe(204);
            });
        });

        describe('Когда курс не найден', () => {
            it('должен вернуть ошибку 404', async () => {
                // Given
                const nonExistentId = 'non-existent-id';

                // When
                const response = await request(app).delete(`/courses/${nonExistentId}`);

                // Then
                expect(response.status).toBe(404);
            });
        });
    });
});