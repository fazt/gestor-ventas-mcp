import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, isUniqueViolation } from "../lib/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      statusCode: 400,
      message: "Datos inválidos",
      details: err.issues,
    });
    return;
  }

  if (err instanceof SyntaxError) {
    res.status(400).json({
      statusCode: 400,
      message: "JSON inválido",
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      statusCode: err.statusCode,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  if (isUniqueViolation(err)) {
    res.status(409).json({
      statusCode: 409,
      message: "El registro viola una restricción de unicidad",
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    statusCode: 500,
    message: "Error interno del servidor",
  });
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, `Ruta no encontrada: ${req.method} ${req.path}`));
}
