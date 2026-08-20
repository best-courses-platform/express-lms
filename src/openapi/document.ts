import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry';
import { config } from '../config';
// Импорт исключительно ради побочного эффекта — каждый файл регистрирует свои пути в
// том же самом registry при импорте. Порядок между модулями не важен (registry — общий
// объект, накапливает регистрации независимо от того, в каком файле они произошли).
import './auth.openapi';
import './courses.openapi';
import './lessons.openapi';
import './users.openapi';

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Best Courses Ever API',
      version: '1.0.0',
      description:
        'REST API образовательной платформы (курсы, уроки, аутентификация, пользователи). ' +
        'Сгенерировано из тех же Zod-схем, что реально валидируют запросы — не отдельный, ' +
        'вручную поддерживаемый документ, который может разойтись с кодом.',
    },
    servers: [{ url: `http://localhost:${config.port}`, description: 'Текущее окружение' }],
  });
}
