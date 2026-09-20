export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function getPgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if ("cause" in error) {
    return getPgErrorCode(error.cause);
  }

  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return getPgErrorCode(error) === "23505";
}

export function isForeignKeyViolation(error: unknown): boolean {
  return getPgErrorCode(error) === "23503";
}
