// jwt/jwt.schema.ts
import { z } from 'zod';
import { COMMON_MESSAGES } from '../../shared/constants/messages';

export const jwtPayloadSchema = z.object({
    sub: z.string().min(1, COMMON_MESSAGES.VALIDATION.USER_ID_REQUIRED),
    email: z.string().email(COMMON_MESSAGES.VALIDATION.EMAIL_INVALID),
    role: z.enum(['student', 'author', 'admin']),
    name: z.string().min(1, COMMON_MESSAGES.VALIDATION.NAME_REQUIRED),
    iat: z.number().optional(),
    exp: z.number().optional(),
    type: z.enum(['access', 'refresh']).default('access')
});

export type JWTPayload = z.infer<typeof jwtPayloadSchema>;

// Валидаторы для использования в сервисах
export const validateJWTPayload = (payload: unknown): JWTPayload => {
    return jwtPayloadSchema.parse(payload);
};

export const isValidJWTPayload = (payload: unknown): payload is JWTPayload => {
    return jwtPayloadSchema.safeParse(payload).success;
};