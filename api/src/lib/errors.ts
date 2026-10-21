/**
 * The only error type services should throw. The error middleware turns it into
 * `{ "error": { "code": string, "message": string } }` with the given HTTP status.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** 400 — request is malformed or a field is invalid. */
export function validationError(message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', message);
}

/** 404 — a referenced entity does not exist. */
export function notFound(entity: string, id: string): AppError {
  return new AppError(404, 'NOT_FOUND', `${entity} ${id} not found`);
}

/** 409 — request conflicts with the current state of a resource. */
export function conflict(code: string, message: string): AppError {
  return new AppError(409, code, message);
}

/** 422 — request is well-formed but breaks a business rule. */
export function businessRule(code: string, message: string): AppError {
  return new AppError(422, code, message);
}
