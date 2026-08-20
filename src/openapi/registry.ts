import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Должно быть выполнено ровно один раз, раньше любого .openapi()-вызова на схемах —
// добавляет метод .openapi() всем Zod-схемам. registry.ts — общая точка входа для всех
// *.openapi.ts файлов модулей (они импортируют `registry` отсюда), поэтому порядок
// гарантирован самой системой модулей: этот файл выполнится первым при первом импорте.
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// JWT читается из двух мест одновременно (см. passport/strategy/jwt.strategy.ts —
// ExtractJwt.fromExtractors: сначала Authorization: Bearer, потом cookie access_token) —
// оба варианта реально работают, оба стоит показать в документации, не только один.
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Access-токен в заголовке Authorization: Bearer <token>.',
});

registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'access_token',
  description: 'Access-токен в httpOnly cookie — то же самое, что ставит POST /api/auth/login.',
});

// Явная аннотация — без неё TS выводит union из двух объектов с РАЗНЫМИ единственными
// ключами ({bearerAuth} | {cookieAuth}), что не проходит по индексной сигнатуре
// SecurityRequirementObject (все ключи должны быть string[], а в each конкретном
// литерале второй ключ отсутствует, а не "string[] | undefined").
export const authSecurity: Record<string, string[]>[] = [{ bearerAuth: [] }, { cookieAuth: [] }];

// Единый контракт ошибок для всего API — см. middleware/error-handler.ts: AppError даёт
// { error, details? } с её собственным статусом, любая непредвиденная ошибка — { error }
// с 500. Одна схема, переиспользуемая на каждом объявленном в этом файле статусе ошибки
// в каждом модуле — не дублировать на каждый эндпоинт отдельно.
export const errorResponseSchema = registry.register(
  'Error',
  z.object({
    error: z.string().openapi({ example: 'Курс не найден' }),
    details: z.unknown().optional(),
  })
);

export function errorResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: errorResponseSchema } },
  };
}

export function jsonBody(schema: z.ZodTypeAny) {
  return { content: { 'application/json': { schema } } };
}
