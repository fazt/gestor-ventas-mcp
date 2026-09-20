import type { NextFunction, Request, Response } from "express";

export class OAuthHttpError extends Error {
  readonly status: number;
  readonly error: string;
  readonly errorDescription: string;

  constructor(status: number, error: string, errorDescription: string) {
    super(errorDescription);
    this.name = "OAuthHttpError";
    this.status = status;
    this.error = error;
    this.errorDescription = errorDescription;
  }
}

export function oauthErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!(err instanceof OAuthHttpError)) {
    next(err);
    return;
  }

  res.status(err.status).json({
    error: err.error,
    error_description: err.errorDescription,
  });
}
