import { db, users } from "@gestor/db";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";
import { verifyApiToken, verifyWebToken } from "../lib/jwt.js";

async function attachUser(req: Request, userId: number): Promise<void> {
  if (!Number.isInteger(userId)) {
    throw new AppError(401, "Token inválido");
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) {
    throw new AppError(401, "No autenticado");
  }

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const payload = verifyApiToken(header.slice("Bearer ".length));
      await attachUser(req, Number(payload.sub));
      next();
      return;
    }

    const token = req.cookies?.token as string | undefined;
    if (!token) {
      throw new AppError(401, "No autenticado");
    }

    const payload = verifyWebToken(token);
    await attachUser(req, Number(payload.sub));
    next();
  } catch (error) {
    next(error);
  }
}
