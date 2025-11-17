// domains/auth/auth.schema.ts
import { z } from 'zod';
import { AUTH_MESSAGES } from './auth.constants';

// Базовые схемы для переиспользования
const nameSchema = z.string()
    .min(1, AUTH_MESSAGES.VALIDATION.NAME_REQUIRED)
    .max(100, AUTH_MESSAGES.VALIDATION.NAME_TOO_LONG)
    .trim();

const emailSchema = z.string()
    .email(AUTH_MESSAGES.VALIDATION.EMAIL_INVALID)
    .toLowerCase()
    .trim();

const passwordSchema = z.string()
    .min(6, AUTH_MESSAGES.VALIDATION.PASSWORD_TOO_SHORT)
    .max(30, AUTH_MESSAGES.VALIDATION.PASSWORD_TOO_LONG);

const roleSchema = z.enum(['student', 'author', 'admin']);

export const registerSchema = z.object({
    body: z.object({
        name: nameSchema,
        email: emailSchema,
        password: passwordSchema,
        confirmPassword: z.string().min(1, AUTH_MESSAGES.VALIDATION.CONFIRM_PASSWORD_REQUIRED),
        role: roleSchema.default('student')
    }).refine((data) => data.password === data.confirmPassword, {
        message: AUTH_MESSAGES.VALIDATION.PASSWORDS_DONT_MATCH,
        path: ["confirmPassword"]
    })
});

export const loginSchema = z.object({
    body: z.object({
        email: emailSchema,
        password: z.string().min(1, AUTH_MESSAGES.VALIDATION.PASSWORD_REQUIRED)
    })
});

export const refreshTokenSchema = z.object({
    body: z.object({
        refreshToken: z.string().optional()
    }).optional(),
    cookies: z.object({
        refresh_token: z.string().optional()
    }).optional()
});

export const updateProfileSchema = z.object({
    body: z.object({
        name: nameSchema.optional(),
        email: emailSchema.optional()
    }).refine((data) => Object.keys(data).length > 0, {
        message: AUTH_MESSAGES.VALIDATION.AT_LEAST_ONE_FIELD
    })
});

export const changePasswordSchema = z.object({
    body: z.object({
        currentPassword: z.string().min(1, AUTH_MESSAGES.VALIDATION.CURRENT_PASSWORD_REQUIRED),
        newPassword: passwordSchema,
        confirmPassword: z.string().min(1, AUTH_MESSAGES.VALIDATION.CONFIRM_PASSWORD_REQUIRED)
    }).refine((data) => data.newPassword === data.confirmPassword, {
        message: AUTH_MESSAGES.VALIDATION.PASSWORDS_DONT_MATCH,
        path: ["confirmPassword"]
    })
});

// Типы для TypeScript
export type RegisterInput = z.infer<typeof registerSchema>["body"];
export type LoginInput = z.infer<typeof loginSchema>["body"];
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>["body"];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>["body"];