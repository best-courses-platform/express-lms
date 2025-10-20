import { lessonService } from '../lesson.service';
import { lessonRepository } from '../lesson.repository';
import { AppError } from '../../../utils/errors';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ILesson } from '../lesson.types';
import { Types } from 'mongoose';

// Моки
jest.mock('../lesson.repository');

// Типизированный мок репозитория
const mockLessonRepository = lessonRepository as jest.Mocked<typeof lessonRepository>;

// Вспомогательная функция для создания mock урока
const createMockLesson = (overrides?: Partial<ILesson>): ILesson => ({
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
    updatedAt: new Date(),
    ...overrides
} as ILesson);

describe('Lesson Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Создание урока', () => {
        describe('Когда название урока уникально в рамках курса', () => {
            it('должен создать новый урок', async () => {
                // Given
                const newLessonData = {
                    title: 'New Lesson',
                    description: 'Lesson Description',
                    courseId: new Types.ObjectId(),
                    order: 1,
                    tags: ['programming'],
                    allowedUsers: []
                };

                const mockLesson = createMockLesson({
                    _id: new Types.ObjectId(),
                    ...newLessonData
                });

                mockLessonRepository.findByTitleAndCourse.mockResolvedValue(null);
                mockLessonRepository.create.mockResolvedValue(mockLesson);

                // When
                const result = await lessonService.create(newLessonData);

                // Then
                expect(mockLessonRepository.findByTitleAndCourse).toHaveBeenCalledWith(
                    'New Lesson',
                    newLessonData.courseId.toString()
                );
                expect(mockLessonRepository.create).toHaveBeenCalledWith(newLessonData);
                expect(result).toEqual(mockLesson);
            });
        });

        describe('Когда урок с таким названием уже существует в курсе', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                const newLessonData = {
                    title: 'Existing Lesson',
                    description: 'Lesson Description',
                    courseId: new Types.ObjectId(),
                    order: 1,
                    tags: ['programming'],
                    allowedUsers: []
                };

                const existingLesson = createMockLesson({
                    _id: new Types.ObjectId(),
                    ...newLessonData
                });

                mockLessonRepository.findByTitleAndCourse.mockResolvedValue(existingLesson);

                // When & Then
                await expect(lessonService.create(newLessonData))
                    .rejects
                    .toThrow(new AppError(409, 'Урок с таким названием уже существует в этом курсе'));
            });
        });

        describe('Когда передан некорректный courseId', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                const newLessonData = {
                    title: 'New Lesson',
                    description: 'Lesson Description',
                    courseId: 'invalid-id' as any,
                    order: 1,
                    tags: ['programming'],
                    allowedUsers: []
                };

                // When & Then
                await expect(lessonService.create(newLessonData))
                    .rejects
                    .toThrow(new AppError(400, 'Некорректный ID курса'));
            });
        });
    });

    describe('Получение урока по ID', () => {
        describe('Когда урок существует', () => {
            it('должен вернуть урок', async () => {
                // Given
                const mockLesson = createMockLesson({
                    _id: new Types.ObjectId('123'),
                    title: 'Test Lesson',
                    description: 'Test Description'
                });

                mockLessonRepository.findById.mockResolvedValue(mockLesson);

                // When
                const result = await lessonService.getById('123');

                // Then
                expect(mockLessonRepository.findById).toHaveBeenCalledWith('123');
                expect(result).toEqual(mockLesson);
            });
        });

        describe('Когда урок не найден', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                mockLessonRepository.findById.mockResolvedValue(null);

                // When & Then
                await expect(lessonService.getById('nonexistent'))
                    .rejects
                    .toThrow(new AppError(404, 'Урок не найден'));
            });
        });

        describe('Когда передан некорректный ID', () => {
            it('должен выбросить ошибку AppError', async () => {
                // When & Then
                await expect(lessonService.getById('invalid-id'))
                    .rejects
                    .toThrow(new AppError(400, 'Некорректный ID урока'));
            });
        });
    });

    describe('Обновление урока', () => {
        describe('Когда урок существует и название уникально', () => {
            it('должен обновить урок', async () => {
                // Given
                const existingLesson = createMockLesson({
                    _id: new Types.ObjectId('123'),
                    title: 'Old Title',
                    courseId: new Types.ObjectId('course123')
                });

                const updateData = {
                    title: 'New Title',
                    difficulty: 'advanced' as const
                };

                const updatedLesson = createMockLesson({
                    ...existingLesson,
                    ...updateData,
                    updatedAt: new Date()
                });

                mockLessonRepository.findById.mockResolvedValue(existingLesson);
                mockLessonRepository.findByTitleAndCourse.mockResolvedValue(null);
                mockLessonRepository.update.mockResolvedValue(updatedLesson);

                // When
                const result = await lessonService.update('123', updateData);

                // Then
                expect(mockLessonRepository.findById).toHaveBeenCalledWith('123');
                expect(mockLessonRepository.findByTitleAndCourse).toHaveBeenCalledWith(
                    'New Title',
                    'course123'
                );
                expect(mockLessonRepository.update).toHaveBeenCalledWith('123', updateData);
                expect(result).toEqual(updatedLesson);
            });
        });

        describe('Когда название урока уже используется в этом курсе', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                const existingLesson = createMockLesson({
                    _id: new Types.ObjectId('123'),
                    title: 'Current Lesson',
                    courseId: new Types.ObjectId('course123')
                });

                const otherLesson = createMockLesson({
                    _id: new Types.ObjectId('456'),
                    title: 'Other Lesson',
                    courseId: new Types.ObjectId('course123')
                });

                const updateData = {
                    title: 'Other Lesson'
                };

                mockLessonRepository.findById.mockResolvedValue(existingLesson);
                mockLessonRepository.findByTitleAndCourse.mockResolvedValue(otherLesson);

                // When & Then
                await expect(lessonService.update('123', updateData))
                    .rejects
                    .toThrow(new AppError(409, 'Урок с таким названием уже существует в этом курсе'));
            });
        });
    });

    describe('Получение уроков по курсу', () => {
        describe('Когда курс существует', () => {
            it('должен вернуть уроки курса', async () => {
                // Given
                const courseId = new Types.ObjectId('course123');
                const mockLessons = [
                    createMockLesson({ courseId, order: 1 }),
                    createMockLesson({ courseId, order: 2 })
                ];

                mockLessonRepository.findByCourseId.mockResolvedValue(mockLessons);

                // When
                const result = await lessonService.getByCourseId('course123');

                // Then
                expect(mockLessonRepository.findByCourseId).toHaveBeenCalledWith('course123');
                expect(result).toEqual(mockLessons);
            });
        });
    });

    describe('Проверка доступа пользователя', () => {
        describe('Когда пользователь имеет доступ к уроку', () => {
            it('должен вернуть true', async () => {
                // Given
                const userId = new Types.ObjectId('user123');
                const mockLesson = createMockLesson({
                    _id: new Types.ObjectId('lesson123'),
                    allowedUsers: [userId, new Types.ObjectId('user456')]
                });

                mockLessonRepository.findById.mockResolvedValue(mockLesson);

                // When
                const result = await lessonService.checkUserAccess('lesson123', 'user123');

                // Then
                expect(result).toBe(true);
            });
        });

        describe('Когда пользователь не имеет доступ к уроку', () => {
            it('должен вернуть false', async () => {
                // Given
                const mockLesson = createMockLesson({
                    _id: new Types.ObjectId('lesson123'),
                    allowedUsers: [new Types.ObjectId('otherUser')]
                });

                mockLessonRepository.findById.mockResolvedValue(mockLesson);

                // When
                const result = await lessonService.checkUserAccess('lesson123', 'user123');

                // Then
                expect(result).toBe(false);
            });
        });
    });

    describe('Добавление пользователя в список разрешенных', () => {
        describe('Когда пользователь еще не имеет доступа', () => {
            it('должен добавить пользователя и вернуть обновленный урок', async () => {
                // Given
                const existingLesson = createMockLesson({
                    _id: new Types.ObjectId('lesson123'),
                    allowedUsers: []
                });

                const updatedLesson = createMockLesson({
                    ...existingLesson,
                    allowedUsers: [new Types.ObjectId('user123')]
                });

                mockLessonRepository.findById.mockResolvedValue(existingLesson);
                mockLessonRepository.update.mockResolvedValue(updatedLesson);

                // When
                const result = await lessonService.addUserToAllowed('lesson123', 'user123');

                // Then
                expect(mockLessonRepository.update).toHaveBeenCalledWith('lesson123', {
                    allowedUsers: [new Types.ObjectId('user123')]
                });
                expect(result).toEqual(updatedLesson);
            });
        });

        describe('Когда пользователь уже имеет доступ', () => {
            it('должен выбросить ошибку AppError', async () => {
                // Given
                const existingLesson = createMockLesson({
                    _id: new Types.ObjectId('lesson123'),
                    allowedUsers: [new Types.ObjectId('user123')]
                });

                mockLessonRepository.findById.mockResolvedValue(existingLesson);

                // When & Then
                await expect(lessonService.addUserToAllowed('lesson123', 'user123'))
                    .rejects
                    .toThrow(new AppError(409, 'Пользователь уже имеет доступ к этому уроку'));
            });
        });
    });
});