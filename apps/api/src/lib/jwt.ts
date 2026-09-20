import type { UserRole } from "@gestor/shared";
import type { CookieOptions } from "express";
import jwt from "jsonwebtoken";
import { env } from "./env.js";
import { AppError } from "./errors.js";
import { mcpResourceUrl, oauthIssuer } from "./urls.js";

export const WEB_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
export const API_TOKEN_TTL_SECONDS = 60 * 5;
export const MCP_ACCESS_TTL_SECONDS = 60 * 15;

export const AUD_WEB = "web";
export const AUD_API = "api";

export type JwtPayload = {
  sub: string;
  role: UserRole;
  email: string;
  name: string;
  aud?: string | string[];
  iss?: string;
  scope?: string;
};

type SignUser = Pick<JwtPayload, "sub" | "role" | "email" | "name">;

function audienceOf(payload: jwt.JwtPayload | JwtPayload): string | undefined {
  const aud = payload.aud;
  if (Array.isArray(aud)) {
    return aud[0];
  }
  return aud;
}

export function signWebToken(payload: SignUser): string {
  return jwt.sign({ ...payload, aud: AUD_WEB, iss: oauthIssuer() }, env.JWT_SECRET, {
    expiresIn: WEB_TOKEN_TTL_SECONDS,
  });
}

/** Un `ttlSeconds` <= 0 firma un token sin `exp`, reservado a pruebas locales. */
export function signApiToken(
  payload: SignUser,
  ttlSeconds: number = API_TOKEN_TTL_SECONDS,
): string {
  const claims = { ...payload, aud: AUD_API, iss: oauthIssuer() };
  if (ttlSeconds <= 0) {
    return jwt.sign(claims, env.JWT_SECRET);
  }
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: ttlSeconds });
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
    { expiresIn: MCP_ACCESS_TTL_SECONDS },
  );
}

/** @deprecated use signWebToken */
export function signToken(payload: SignUser): string {
  return signWebToken(payload);
}

export function verifyToken(token: string, expectedAud?: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded !== "object" || decoded === null || typeof decoded.sub !== "string") {
      throw new AppError(401, "Token inválido");
    }

    const payload = decoded as JwtPayload;
    if (expectedAud) {
      const aud = audienceOf(payload);
      if (aud !== expectedAud) {
        throw new AppError(401, "Token inválido");
      }
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
  const payload = verifyToken(token);
  const aud = audienceOf(payload);
  if (aud && aud !== AUD_WEB) {
    throw new AppError(401, "Token inválido");
  }
  return payload;
}

export function verifyApiToken(token: string): JwtPayload {
  return verifyToken(token, AUD_API);
}

export function verifyMcpAccessToken(token: string): JwtPayload {
  return verifyToken(token, mcpResourceUrl());
}

export function authCookieOptions(): CookieOptions {
  const isProd = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: WEB_TOKEN_TTL_SECONDS * 1000,
  };
}
