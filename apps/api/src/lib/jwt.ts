import type { UserRole } from "@gestor/shared";
import type { CookieOptions } from "express";
import jwt from "jsonwebtoken";
import { env } from "./env.js";
import { AppError } from "./errors.js";
import { mcpResourceUrl, oauthIssuer } from "./urls.js";

export const WEB_TOKEN_TTL_SECONDS = 60 * 60 * 12;
export const MCP_ACCESS_TTL_SECONDS = 60 * 15;

export const AUD_WEB = "web";
export const AUTH_COOKIE = "token";

/**
 * Claims del JWT. El rol y el estado se vuelven a leer de la base en cada petición:
 * lo que viaja en el token es solo informativo (desactivar o degradar a un usuario
 * corta el acceso al instante, sin esperar a que caduque).
 */
export type JwtPayload = {
  sub: string;
  role: UserRole;
  email: string;
  name: string;
  aud?: string | string[];
  iss?: string;
  scope?: string;
  client_id?: string;
  exp?: number;
};

type SignUser = Pick<JwtPayload, "sub" | "role" | "email" | "name">;

function audienceOf(payload: JwtPayload): string | undefined {
  const aud = payload.aud;
  if (Array.isArray(aud)) {
    return aud[0];
  }
  return aud;
}

export function signWebToken(payload: SignUser): string {
  return jwt.sign({ ...payload, aud: AUD_WEB, iss: oauthIssuer() }, env.JWT_SECRET, {
    expiresIn: WEB_TOKEN_TTL_SECONDS,
    algorithm: "HS256",
  });
}

export function signMcpAccessToken(payload: SignUser & { clientId: string }): string {
  return jwt.sign(
    {
      sub: payload.sub,
      role: payload.role,
      email: payload.email,
      name: payload.name,
      client_id: payload.clientId,
      aud: mcpResourceUrl(),
      iss: oauthIssuer(),
      scope: "mcp",
    },
    env.JWT_SECRET,
    { expiresIn: MCP_ACCESS_TTL_SECONDS, algorithm: "HS256" },
  );
}

export function verifyToken(token: string, expectedAud: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: oauthIssuer(),
    });
    if (typeof decoded !== "object" || decoded === null || typeof decoded.sub !== "string") {
      throw new AppError(401, "Token inválido");
    }
    const payload = decoded as JwtPayload;
    if (audienceOf(payload) !== expectedAud) {
      throw new AppError(401, "Token inválido");
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(401, "Token inválido o expirado");
  }
}

export function verifyWebToken(token: string): JwtPayload {
  return verifyToken(token, AUD_WEB);
}

export function verifyMcpAccessToken(token: string): JwtPayload {
  return verifyToken(token, mcpResourceUrl());
}

export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: env.COOKIE_SAMESITE,
    secure: env.COOKIE_SECURE,
    path: "/",
    maxAge: WEB_TOKEN_TTL_SECONDS * 1000,
  };
}

/** Para `clearCookie`: mismas opciones salvo `maxAge` (Express 5 avisa si se pasa). */
export function clearAuthCookieOptions(): CookieOptions {
  const { maxAge: _maxAge, ...rest } = authCookieOptions();
  return rest;
}
