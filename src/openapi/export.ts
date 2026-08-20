import fs from 'fs';
import path from 'path';
import { buildOpenApiDocument } from './document';

// Курс явно требует сохранённый файл технического описания API, готовый к импорту на
// editor.swagger.io — не просто живой /api-docs.json эндпоинт (см. Obsidian: "0.1 Требования
// от курса"). Перегенерировать при изменении роутов/схем: npm run openapi:export.
const OUTPUT_PATH = path.join(__dirname, '../../openapi.json');

const document = buildOpenApiDocument();
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(document, null, 2), 'utf-8');

console.log(`OpenAPI-спецификация сохранена: ${OUTPUT_PATH}`);
