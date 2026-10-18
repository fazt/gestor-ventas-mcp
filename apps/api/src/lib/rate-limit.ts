import type { Request, RequestHandler } from "express";
import { ipKeyGenerator, rateLimit, type Options } from "express-rate-limit";
import { sha256Hex } from "./crypto.js";
import { env } from "./env.js";

function passthrough(): RequestHandler {
  return (_req, _res, next) => next();
}

function limiter(options: Partial<Options>): RequestHandler {
  if (!env.RATE_LIMIT_ENABLED) {
    return passthrough();
  }
  return rateLimit({
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { statusCode: 429, message: "Demasiadas solicitudes, intenta más tarde" },
    ...options,
  });
}

function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? "unknown");
}

function emailFromBody(req: Request): string {
  const body = req.body as Record<string, unknown> | undefined;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  return email.slice(0, 255);
}

/**
 * Login (panel y formulario OAuth): solo cuentan los intentos FALLIDOS, por IP + correo,
 * para frenar fuerza bruta sin bloquear a quien entra bien.
 */
export const loginLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: env.LOGIN_MAX_FAILED_PER_15M,
  skipSuccessfulRequests: true,
  // El POST /oauth/authorize exitoso responde 302: también cuenta como éxito.
  requestWasSuccessful: (_req, res) => res.statusCode < 400,
  keyGenerator: (req) => `${ipKey(req)}:${emailFromBody(req)}`,
});

/**
 * Tope por correo, sin IP: si un proxy intermedio no fija X-Forwarded-For, la IP se
 * puede falsear; este límite frena la fuerza bruta contra una cuenta igualmente.
 */
export const loginEmailLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: env.LOGIN_MAX_FAILED_PER_15M * 3,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode < 400,
  keyGenerator: (req) => `email:${emailFromBody(req) || "-"}`,
});

/** Tope por IP para el login, aunque se roten correos. */
export const loginIpLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  limit: env.LOGIN_MAX_FAILED_PER_15M * 5,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode < 400,
  keyGenerator: ipKey,
});

/**
 * Registro dinámico de clientes OAuth (RFC 7591): responde 201 siempre, así que se
 * limitan TODAS las peticiones; si no, cualquiera llena la tabla `oauth_clients`.
 */
export const oauthRegisterLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: env.OAUTH_REGISTER_MAX_PER_HOUR,
  keyGenerator: ipKey,
  message: { error: "too_many_requests", error_description: "Demasiados registros, intenta más tarde" },
});

export const oauthTokenLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: ipKey,
  message: { error: "too_many_requests", error_description: "Demasiadas solicitudes" },
});

/** Creación de tokens personales y usuarios: acciones sensibles aunque respondan 2xx. */
export const sensitiveActionLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKey(req)),
});

/** Endpoint MCP: por token (cada agente tiene su cupo), o por IP si no hay cabecera. */
export const mcpLimiter = limiter({
  windowMs: 60 * 1000,
  limit: env.MCP_MAX_REQUESTS_PER_MIN,
  keyGenerator: (req) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      // Hash del token completo: los JWT comparten los primeros caracteres (cabecera).
      return `bearer:${sha256Hex(header.slice(7)).slice(0, 24)}`;
    }
    return ipKey(req);
  },
  message: { error: "too_many_requests", error_description: "Demasiadas solicitudes al servidor MCP" },
});

/** Tope general de la API REST. */
export const apiLimiter = limiter({
  windowMs: 60 * 1000,
  limit: 600,
  keyGenerator: ipKey,
});
