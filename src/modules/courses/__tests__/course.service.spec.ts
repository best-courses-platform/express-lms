import { courseService } from '../course.service';
import { courseRepository } from '../course.repository';
import { AppError } from '../../../utils/errors';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ICourse, NewCourse } from '../course.types';
import { Types } from 'mongoose';

// Моки
jest.mock('../course.repository');

// Типизированный мок репозитория
const mockCourseRepository = courseRepository as jest.Mocked<typeof courseRepository>;

// Вспомогательная функция для создания mock курса
const createMockCourse = (overrides?: Partial<ICourse>): ICourse => ({
    _id: new Types.ObjectId(),
    title: 'Test Course',
    description: 'Test Description',
    previewImage: 'test.jpg',
    author: 'Test Author',
    tags: ['javascript', 'typescript'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
} as ICourse);

describe('Course Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Создание курса', () => {
        describe('Когда название не занято', () => {
            it('должен создать новый курс', async () => {
                // Given
                const newCourseData: NewCourse = {
                    title: 'New Course',
                    description: 'New Description',
                    previewImage: 'new.jpg',
                    author: new Types.ObjectId(),
                    tags: ['react'],
                    difficulty: 'beginner' as const,
                    ratings: [],
                    isPublished: false,
                };

                const mockCourse = createMockCourse({
                    _id: new Types.ObjectId(),
                    ...newCourseData
                });

                mockCourseRepository.findByTitle.mockResolvedValue(null);
                mockCourseRepository.create.mockResolvedValue(mockCourse);

                // When
                const result = await courseService.create(newCourseData);

                // Then
                expect(mockCourseRepository.findByTitle).toHaveBeenCalledWith('New Course');
                expect(mockCourseRepository.create).toHaveBeenCalledWith(newCourseData);
                expect(result).toEqual(mockCourse);
            });
        });

        describe('Когда название уже занято', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                const newCourseData: NewCourse = {
                    title: 'Existing Course',
                    description: 'Test Description',
                    previewImage: 'test.jpg',
                    author: new Types.ObjectId(),
                    tags: ['javascript'],
                    difficulty: 'beginner' as const,
                    ratings: [],
                    isPublished: false,
                };

                const existingCourse = createMockCourse({
                    _id: new Types.ObjectId(),
                    ...newCourseData
                });

                mockCourseRepository.findByTitle.mockResolvedValue(existingCourse);

                // When & Then
                await expect(courseService.create(newCourseData))
                    .rejects
                    .toThrow(new AppError(409, 'This course already exists'));
            });
        });
    });

    describe('Получение курса по ID', () => {
        describe('Когда курс существует', () => {
            it('должен вернуть курс', async () => {
                // Given
                const mockCourse = createMockCourse({
                    _id: new Types.ObjectId('123'),
                    title: 'Test Course',
                    description: 'Test Description'
                });

                mockCourseRepository.findById.mockResolvedValue(mockCourse);

                // When
                const result = await courseService.getById('123');

                // Then
                expect(mockCourseRepository.findById).toHaveBeenCalledWith('123');
                expect(result).toEqual(mockCourse);
            });
        });

        describe('Когда курс не найден', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                mockCourseRepository.findById.mockResolvedValue(null);

                // When & Then
                await expect(courseService.getById('nonexistent'))
                    .rejects
                    .toThrow(new AppError(404, 'Course not found'));
            });
        });
    });

    describe('Обновление курса', () => {
        describe('Когда курс существует и название свободно', () => {
            it('должен обновить курс', async () => {
                // Given
                const existingCourse = createMockCourse({
                    _id: new Types.ObjectId('123'),
                    title: 'Old Title',
                    description: 'Old Description'
                });

                const updateData = {
                    title: 'New Title',
                    description: 'New Description'
                };

                const updatedCourse = createMockCourse({
                    ...existingCourse,
                    ...updateData,
                    updatedAt: new Date()
                });

                mockCourseRepository.findById.mockResolvedValue(existingCourse);
                mockCourseRepository.findByTitle.mockResolvedValue(null);
                mockCourseRepository.update.mockResolvedValue(updatedCourse);

                // When
                const result = await courseService.update('123', updateData);

                // Then
                expect(mockCourseRepository.findById).toHaveBeenCalledWith('123');
                expect(mockCourseRepository.findByTitle).toHaveBeenCalledWith('New Title');
                expect(mockCourseRepository.update).toHaveBeenCalledWith('123', updateData);
                expect(result).toEqual(updatedCourse);
            });
        });

        describe('Когда название уже занято другим курсом', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                const existingCourse = createMockCourse({
                    _id: new Types.ObjectId('123'),
                    title: 'Current Course',
                    description: 'Current Description'
                });

                const otherCourse = createMockCourse({
                    _id: new Types.ObjectId('456'),
                    title: 'Other Course',
                    description: 'Other Description'
                });

                const updateData = {
                    title: 'Other Course'
                };

                mockCourseRepository.findById.mockResolvedValue(existingCourse);
                mockCourseRepository.findByTitle.mockResolvedValue(otherCourse);

                // When & Then
                await expect(courseService.update('123', updateData))
                    .rejects
                    .toThrow(new AppError(409, 'This course already exists'));
            });
        });

        describe('Когда курс не найден при обновлении', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                const updateData = {
                    title: 'Updated Title'
                };

                mockCourseRepository.findById.mockResolvedValue(null);

                // When & Then
                await expect(courseService.update('nonexistent', updateData))
                    .rejects
                    .toThrow(new AppError(404, 'Course not found'));
            });
        });
    });

    describe('Удаление курса', () => {
        describe('Когда курс существует', () => {
            it('должен удалить курс', async () => {
                // Given
                mockCourseRepository.delete.mockResolvedValue(true);

                // When
                await courseService.delete('123');

                // Then
                expect(mockCourseRepository.delete).toHaveBeenCalledWith('123');
            });
        });

        describe('Когда курс не найден', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                mockCourseRepository.delete.mockResolvedValue(false);

                // When & Then
                await expect(courseService.delete('nonexistent'))
                    .rejects
                    .toThrow(new AppError(404, 'Course not found'));
            });
        });
    });
});