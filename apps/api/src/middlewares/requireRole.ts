import type { UserRole } from "@gestor/shared";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "No autenticado"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, "No autorizado"));
      return;
    }
    next();
  };
}
