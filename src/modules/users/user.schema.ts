// domains/users/user.schema.ts
import { z } from 'zod';
import { USER_MESSAGES } from './user.constants';

// Базовые схемы для переиспользования
const nameSchema = z.string()
    .min(1, USER_MESSAGES.VALIDATION.NAME_REQUIRED)
    .max(100, USER_MESSAGES.VALIDATION.NAME_TOO_LONG)
    .trim();

const emailSchema = z.string()
    .min(1, USER_MESSAGES.VALIDATION.EMAIL_REQUIRED)
    .email(USER_MESSAGES.VALIDATION.EMAIL_INVALID)
    .toLowerCase()
    .trim();

const passwordSchema = z.string()
    .min(1, USER_MESSAGES.VALIDATION.PASSWORD_REQUIRED)
    .min(6, USER_MESSAGES.VALIDATION.PASSWORD_TOO_SHORT)
    .max(30, USER_MESSAGES.VALIDATION.PASSWORD_TOO_LONG);

const roleSchema = z.enum(['student', 'author', 'admin'])
    .refine(
        (val) => ['student', 'author', 'admin'].includes(val),
        { message: USER_MESSAGES.VALIDATION.INVALID_ROLE }
    );

const avatarSchema = z.string()
    .url(USER_MESSAGES.VALIDATION.AVATAR_INVALID)
    .optional()
    .nullable();

const idSchema = z.string()
    .min(1, USER_MESSAGES.VALIDATION.USER_ID_REQUIRED);

// Базовые схемы для тела запроса
export const userBaseSchema = z.object({
    name: nameSchema,
    email: emailSchema,
    role: roleSchema.default('student'),
    avatar: avatarSchema
});

// Создание пользователя (для админских операций)
export const createUserSchema = z.object({
    body: userBaseSchema.extend({
        password: passwordSchema,
        confirmPassword: z.string().min(1, USER_MESSAGES.VALIDATION.CONFIRM_PASSWORD_REQUIRED)
    }).refine((data) => data.password === data.confirmPassword, {
        message: USER_MESSAGES.VALIDATION.PASSWORDS_DONT_MATCH,
        path: ["confirmPassword"]
    })
});

// Обновление пользователя
export const updateUserSchema = z.object({
    params: z.object({
        id: idSchema
    }),
    body: userBaseSchema.partial()
        .refine((data) => Object.keys(data).length > 0, {
            message: USER_MESSAGES.VALIDATION.AT_LEAST_ONE_FIELD
        })
});

// Смена пароля (для пользовательского контроллера)
export const changePasswordSchema = z.object({
    params: z.object({
        id: idSchema
    }),
    body: z.object({
        currentPassword: z.string().min(1, USER_MESSAGES.VALIDATION.CURRENT_PASSWORD_REQUIRED),
        newPassword: passwordSchema,
        confirmPassword: z.string().min(1, USER_MESSAGES.VALIDATION.CONFIRM_PASSWORD_REQUIRED)
    }).refine((data) => data.newPassword === data.confirmPassword, {
        message: USER_MESSAGES.VALIDATION.PASSWORDS_DONT_MATCH,
        path: ["confirmPassword"]
    })
});

// ID параметр
export const idParamSchema = z.object({
    params: z.object({
        id: idSchema
    })
});

// Схема для поиска пользователей с пагинацией
export const userListSchema = z.object({
    query: z.object({
        page: z.string().optional().default('1').transform(Number),
        limit: z.string().optional().default('10').transform(Number),
        role: roleSchema.optional(),
        search: z.string().optional()
    }).refine((data) => data.page > 0, {
        message: "Страница должна быть положительным числом"
    }).refine((data) => data.limit > 0 && data.limit <= 100, {
        message: "Лимит должен быть от 1 до 100"
    })
});

// Типы для TypeScript
export type CreateUserInput = z.infer<typeof createUserSchema>["body"];
export type UpdateUserInput = z.infer<typeof updateUserSchema>["body"];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];
export type IdParamInput = z.infer<typeof idParamSchema>["params"];
export type UserListQuery = z.infer<typeof userListSchema>["query"];