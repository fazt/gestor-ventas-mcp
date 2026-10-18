import { db, users } from "@gestor/db";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { resolveApiToken } from "../lib/api-tokens.js";
import { AppError } from "../lib/errors.js";
import { AUTH_COOKIE, verifyWebToken } from "../lib/jwt.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

async function loadActiveUser(userId: number) {
  if (!Number.isInteger(userId)) {
    throw new AppError(401, "Token inválido");
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) {
    throw new AppError(401, "No autenticado");
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
}

/**
 * Autenticación de la API REST:
 * - Panel: cookie httpOnly `token` (JWT de audiencia `web`).
 * - Scripts e integraciones: `Authorization: Bearer gv_...` (token personal). Un token
 *   solo `read` no puede usar métodos de escritura.
 *
 * El usuario (rol y estado) se lee de la base en cada petición.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const principal = await resolveApiToken(header.slice("Bearer ".length).trim());
      if (!principal) {
        throw new AppError(401, "Token inválido, revocado o vencido");
      }
      if (!READ_METHODS.has(req.method) && !principal.scopes.includes("write")) {
        throw new AppError(403, "El token no tiene permiso de escritura");
      }
      req.user = principal.user;
      req.principal = { kind: "pat", tokenId: principal.tokenId, scopes: principal.scopes };
      next();
      return;
    }

    const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
    if (!token) {
      throw new AppError(401, "No autenticado");
    }

    const payload = verifyWebToken(token);
    req.user = await loadActiveUser(Number(payload.sub));
    req.principal = { kind: "session", scopes: ["read", "write"] };
    next();
  } catch (error) {
    next(error);
  }
}

/** Solo sesión del panel: gestionar tokens o usuarios no se permite con otro token. */
export function requireSession(req: Request, _res: Response, next: NextFunction): void {
  if (req.principal?.kind !== "session") {
    next(new AppError(403, "Esta acción requiere iniciar sesión en el panel"));
    return;
  }
  next();
}

export { loadActiveUser };
