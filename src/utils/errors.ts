// Базовый класс остаётся конкретным (не abstract) — он же служит "escape hatch" для
// статусов, для которых не заведён отдельный именованный класс (например, 429 rate-limit).
// errorHandler.ts матчит по `err instanceof AppError`, поэтому проверять его не нужно —
// все подклассы ниже проходят её как есть.
export class AppError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Именованные подклассы — по смыслу ошибки, не по числу кода. Call-site читается как
// `throw new NotFoundError(...)`, а не `throw new AppError(404, ...)`, где 404 — просто
// число, которое нужно держать в голове синхронизированным с намерением.
export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, details?: unknown) {
    super(401, message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, details?: unknown) {
    super(403, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: unknown) {
    super(404, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, message, details);
  }
}

// Для по-настоящему непредвиденных отказов (внешняя зависимость упала, инвариант нарушен).
// В отличие от 4xx-классов выше, это не "штатный" отказ бизнес-логики — по этой же причине
// именно эти throw'ы стоит пересматривать в первую очередь при аудите: часть из них по
// смыслу может быть не "внутренней ошибкой сервера", а сбоем конкретной внешней зависимости
// (SMTP, S3) — здесь оставлен как есть, не разводится дальше, пока нет второго кейса.
export class InternalError extends AppError {
  constructor(message: string, details?: unknown) {
    super(500, message, details);
  }
}
