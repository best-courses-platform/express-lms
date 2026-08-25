import { z } from 'zod';
import { isValidObjectIdString } from '../../utils/typeGuards';

// Валидирует именно формат ObjectId (24-hex), а не просто непустую строку. Без этого
// литеральный path-сегмент (например, будущий /users/export) успешно проходит валидацию
// params и до контроллера/репозитория неотличим от настоящего :id — а поскольку Express
// матчит роуты линейно, литеральный роут, объявленный после параметрического, никогда не
// сработает: запрос всегда перехватит :id-хендлер первым.
export const objectIdSchema = (requiredMessage: string, invalidMessage: string) =>
  z.string().min(1, requiredMessage).refine(isValidObjectIdString, invalidMessage);
