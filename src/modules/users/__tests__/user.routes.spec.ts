// src/users/__tests__/user.routes.spec.ts
import request from 'supertest';
import express from 'express';
import userRoutes from '../user.routes';
import { describe, it, expect, beforeAll } from '@jest/globals';

describe('User Routes', () => {
    let app: express.Application;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/users', userRoutes);
    });

    describe('POST /users', () => {
        describe('Когда переданы корректные данные', () => {
            it('должен создать пользователя', async () => {
                // Given
                const userData = {
                    name: 'New User',
                    email: 'new@example.com',
                    role: 'student'
                };

                // When
                const response = await request(app)
                    .post('/users')
                    .send(userData);

                // Then
                expect(response.status).toBe(201);
                expect(response.body).toHaveProperty('_id');
                expect(response.body.name).toBe(userData.name);
                expect(response.body.email).toBe(userData.email);
            });
        });

        describe('Когда email уже используется', () => {
            it('должен вернуть ошибку 409', async () => {
                // Given
                const userData = {
                    name: 'Duplicate User',
                    email: 'duplicate@example.com',
                    role: 'student'
                };

                // When
                const response = await request(app)
                    .post('/users')
                    .send(userData);

                // Then
                expect(response.status).toBe(409);
            });
        });

        describe('Когда данные невалидны', () => {
            it('должен вернуть ошибку 400 при отсутствии email', async () => {
                // Given
                const invalidData = {
                    name: 'Invalid User',
                    role: 'student'
                };

                // When
                const response = await request(app)
                    .post('/users')
                    .send(invalidData);

                // Then
                expect(response.status).toBe(400);
            });
        });
    });

    describe('GET /users', () => {
        describe('Когда пользователи существуют', () => {
            it('должен вернуть список пользователей', async () => {
                // When
                const response = await request(app).get('/users');

                // Then
                expect(response.status).toBe(200);
                expect(Array.isArray(response.body)).toBe(true);
            });
        });
    });

    describe('GET /users/:id', () => {
        describe('Когда пользователь существует', () => {
            it('должен вернуть пользователя', async () => {
                // Given
                const userId = 'existing-user-id';

                // When
                const response = await request(app).get(`/users/${userId}`);

                // Then
                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('_id', userId);
            });
        });

        describe('Когда пользователь не найден', () => {
            it('должен вернуть ошибку 404', async () => {
                // Given
                const nonExistentId = 'non-existent-id';

                // When
                const response = await request(app).get(`/users/${nonExistentId}`);

                // Then
                expect(response.status).toBe(404);
            });
        });
    });

    describe('PATCH /users/:id', () => {
        describe('Когда пользователь существует и данные валидны', () => {
            it('должен обновить пользователя', async () => {
                // Given
                const userId = 'existing-user-id';
                const updateData = {
                    name: 'Updated Name'
                };

                // When
                const response = await request(app)
                    .patch(`/users/${userId}`)
                    .send(updateData);

                // Then
                expect(response.status).toBe(200);
                expect(response.body.name).toBe(updateData.name);
            });
        });

        describe('Когда email уже используется', () => {
            it('должен вернуть ошибку 409', async () => {
                // Given
                const userId = 'existing-user-id';
                const updateData = {
                    email: 'existing@example.com'
                };

                // When
                const response = await request(app)
                    .patch(`/users/${userId}`)
                    .send(updateData);

                // Then
                expect(response.status).toBe(409);
            });
        });
    });

    describe('DELETE /users/:id', () => {
        describe('Когда пользователь существует', () => {
            it('должен удалить пользователя', async () => {
                // Given
                const userId = 'existing-user-id';

                // When
                const response = await request(app).delete(`/users/${userId}`);

                // Then
                expect(response.status).toBe(204);
            });
        });

        describe('Когда пользователь не найден', () => {
            it('должен вернуть ошибку 404', async () => {
                // Given
                const nonExistentId = 'non-existent-id';

                // When
                const response = await request(app).delete(`/users/${nonExistentId}`);

                // Then
                expect(response.status).toBe(404);
            });
        });
    });
});