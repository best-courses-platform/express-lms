# Образовательная платформа

Веб-приложение для создания и прохождения образовательных курсов с системой ролей, комментариев и рейтингов.

## Технологии

- **Backend**: Express.js + Typescript
- **Database**: MongoDB + Mongoose ORM

## Функциональность

### Роли пользователей
- **Автор**: Создание курсов и уроков, управление контентом
- **Пользователь**: Прохождение курсов, комментирование, оценка
- **Администратор**: Управление платформой

### Основные возможности
- Создание и публикация курсов
- Прохождение курсов другими пользователями
- Комментирование уроков
- Система рейтингов для курсов
- Мультимедийные ресурсы к урокам
- Отслеживание прогресса обучения

## Модели данных

### User
- `id` (uuid)
- `name` (string)
- `email` (string, unique)
- `password` (string)
- `googleId` (string, unique)
- `role` (admin | author | user)
- `avatar` (string, optional)
- `createdAt` (Date)
- `updatedAt` (Date)

### Course
- `id` (uuid)
- `title` (string, unique)
- `description` (string)
- `previewImage` (string)
- `author` (user id)
- `tags` (string)
- `difficulty` (beginner | intermediate | advanced)
- `ratings` (ratings)
- `averageRating` (number)
- `isPublished` (boolean)
- `createdAt` (Date)
- `updatedAt` (Date)

### Ratings
- `userId` (user id)
- `value` (number)
- `createdAt` (Date)

### Lesson
- `id` (uuid)
- `title` (string)
- `description` (string)
- `courseId` (course id)
- `order` (number)
- `videoUrl` (string)
- `resources` (resources)
- `inputExamples` (string)
- `outputExamples` (string)
- `tags` (string)
- `allowedUsers` (user id)
- `createdAt` (Date)
- `updatedAt` (Date)

### Resources
- `type` (file | link | video)
- `title` (string)
- `url` (string)
- `description` (string)