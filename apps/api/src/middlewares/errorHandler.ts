import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, getPgErrorCode, isForeignKeyViolation, isUniqueViolation } from "../lib/errors.js";
import { logger, stripQuery } from "../lib/logger.js";

type HttpLikeError = { status?: number; statusCode?: number; type?: string; expose?: boolean };

function httpStatusOf(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const candidate = err as HttpLikeError;
  const status = candidate.status ?? candidate.statusCode;
  return typeof status === "number" && status >= 400 && status < 600 ? status : undefined;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      statusCode: 400,
      message: err.issues[0]?.message ? `Datos inválidos: ${err.issues[0].message}` : "Datos inválidos",
      details: err.issues.map((issue) => ({ path: issue.path, message: issue.message })),
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
    res.status(409).json({ statusCode: 409, message: "El registro viola una restricción de unicidad" });
    return;
  }

  if (isForeignKeyViolation(err)) {
    res.status(409).json({ statusCode: 409, message: "El registro está referenciado por otros datos" });
    return;
  }

  if (getPgErrorCode(err) === "23514") {
    res.status(409).json({ statusCode: 409, message: "La operación deja datos inválidos (p. ej. stock negativo)" });
    return;
  }

  // Errores de body-parser: JSON mal formado (400), cuerpo demasiado grande (413), etc.
  const status = httpStatusOf(err);
  if (status && status < 500) {
    const type = (err as HttpLikeError).type;
    res.status(status).json({
      statusCode: status,
      message:
        type === "entity.parse.failed"
          ? "JSON inválido"
          : type === "entity.too.large"
            ? "El cuerpo de la petición es demasiado grande"
            : "Solicitud inválida",
    });
    return;
  }

  logger.error({ err, method: req.method, path: stripQuery(req.originalUrl) }, "Error no controlado");
  res.status(500).json({
    statusCode: 500,
    message: "Error interno del servidor",
  });
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, `Ruta no encontrada: ${req.method} ${req.path}`));
}
