import { createHmac, timingSafeEqual } from "node:crypto";
import {
  db,
  oauthAuthorizationCodes,
  oauthClients,
  oauthRefreshTokens,
  users,
} from "@gestor/db";
import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import { newClientId, pkceChallengeS256, randomToken, sha256Hex } from "../../lib/crypto.js";
import { env } from "../../lib/env.js";
import { MCP_ACCESS_TTL_SECONDS, signMcpAccessToken } from "../../lib/jwt.js";
import { mcpResourceUrl } from "../../lib/urls.js";
import { loginUser } from "../auth/auth.service.js";
import { OAuthHttpError } from "./oauth.errors.js";

const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CSRF_TTL_MS = 10 * 60 * 1000;
const MAX_REDIRECT_URIS = 5;
const MAX_URI_LENGTH = 2000;

export type OAuthClient = typeof oauthClients.$inferSelect;

const BLOCKED_REDIRECT_SCHEMES = new Set([
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "about:",
  "blob:",
  "chrome:",
  "edge:",
]);

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

export function isAllowedRedirectUri(uri: string): boolean {
  if (uri.length > MAX_URI_LENGTH) return false;
  try {
    const parsed = new URL(uri);
    const protocol = parsed.protocol.toLowerCase();

    if (BLOCKED_REDIRECT_SCHEMES.has(protocol)) return false;
    // RFC 6749 §3.1.2: el redirect_uri no puede llevar fragmento.
    if (parsed.hash) return false;
    if (protocol === "https:") return true;
    if (protocol === "http:") return isLoopbackHostname(parsed.hostname);

    // Hosts nativos (Cursor, VS Code, Claude Desktop) usan esquemas privados (RFC 8252).
    return /^[a-z][a-z0-9+.-]*:$/.test(protocol);
  } catch {
    return false;
  }
}

/** Host legible del redirect_uri para mostrarlo en el consentimiento. */
export function redirectHost(uri: string): string {
  try {
    const parsed = new URL(uri);
    return parsed.host || parsed.protocol.replace(/:$/, "");
  } catch {
    return "desconocido";
  }
}

export function resourcesMatch(requested: string, expected: string): boolean {
  const normalize = (value: string) => value.replace(/\/$/, "").toLowerCase();
  if (normalize(requested) === normalize(expected)) {
    return true;
  }

  try {
    const a = new URL(requested);
    const b = new URL(expected);
    const hostA = a.hostname === "127.0.0.1" ? "localhost" : a.hostname;
    const hostB = b.hostname === "127.0.0.1" ? "localhost" : b.hostname;
    return (
      a.protocol === b.protocol &&
      hostA === hostB &&
      a.port === b.port &&
      a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}

export async function registerClient(input: {
  client_name?: string;
  redirect_uris?: unknown;
  token_endpoint_auth_method?: string;
}) {
  const redirectUris = Array.isArray(input.redirect_uris)
    ? input.redirect_uris.filter((uri): uri is string => typeof uri === "string")
    : [];

  if (redirectUris.length === 0) {
    throw new OAuthHttpError(400, "invalid_client_metadata", "redirect_uris es obligatorio");
  }
  if (redirectUris.length > MAX_REDIRECT_URIS) {
    throw new OAuthHttpError(400, "invalid_client_metadata", `Máximo ${MAX_REDIRECT_URIS} redirect_uris`);
  }
  if (!redirectUris.every(isAllowedRedirectUri)) {
    throw new OAuthHttpError(
      400,
      "invalid_redirect_uri",
      "redirect_uri debe ser https, http de loopback o un esquema nativo (p. ej. cursor://), sin fragmento",
    );
  }
  if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== "none") {
    throw new OAuthHttpError(
      400,
      "invalid_client_metadata",
      "Solo se admiten clientes públicos (token_endpoint_auth_method=none) con PKCE",
    );
  }

  const clientName = (input.client_name ?? "Cliente MCP").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 100) || "Cliente MCP";
  const clientId = newClientId();
  await db.insert(oauthClients).values({
    clientId,
    clientName,
    redirectUris,
    tokenEndpointAuthMethod: "none",
  });

  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

export async function getClient(clientId: string): Promise<OAuthClient> {
  const [client] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId.slice(0, 64)))
    .limit(1);
  if (!client) {
    throw new OAuthHttpError(400, "invalid_client", "client_id desconocido");
  }
  return client;
}

/**
 * Token anti-CSRF del consentimiento: HMAC de (usuario, cliente, redirect, challenge, hora).
 * Un sitio ajeno no puede fabricarlo y no sirve para otra solicitud ni pasados 10 minutos.
 */
export function consentCsrfToken(parts: {
  userId: number;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  issuedAt?: number;
}): string {
  const issuedAt = parts.issuedAt ?? Date.now();
  const payload = `${parts.userId}|${parts.clientId}|${parts.redirectUri}|${parts.codeChallenge}|${issuedAt}`;
  const mac = createHmac("sha256", env.JWT_SECRET).update(`oauth-consent:${payload}`).digest("base64url");
  return `${issuedAt}.${mac}`;
}

export function verifyConsentCsrf(
  token: string | undefined,
  parts: { userId: number; clientId: string; redirectUri: string; codeChallenge: string },
): boolean {
  if (!token) return false;
  const [rawIssuedAt] = token.split(".");
  const issuedAt = Number(rawIssuedAt);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > CSRF_TTL_MS || issuedAt > Date.now() + 60_000) {
    return false;
  }
  const expected = consentCsrfToken({ ...parts, issuedAt });
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function issueAuthorizationCode(input: {
  clientId: string;
  userId: number;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
}): Promise<string> {
  const code = randomToken(32);
  await db.insert(oauthAuthorizationCodes).values({
    codeHash: sha256Hex(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: "S256",
    resource: input.resource,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });
  return code;
}

async function issueRefreshToken(input: { clientId: string; userId: number; resource: string }): Promise<string> {
  const refresh = randomToken(48);
  await db.insert(oauthRefreshTokens).values({
    tokenHash: sha256Hex(refresh),
    clientId: input.clientId,
    userId: input.userId,
    resource: input.resource,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return refresh;
}

async function userClaims(userId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) {
    throw new OAuthHttpError(400, "invalid_grant", "Usuario inválido o desactivado");
  }
  return {
    sub: String(user.id),
    role: user.role,
    email: user.email,
    name: user.name,
  };
}

async function tokenResponse(row: { clientId: string; userId: number; resource: string }) {
  const claims = await userClaims(row.userId);
  const accessToken = signMcpAccessToken({ ...claims, clientId: row.clientId });
  const refreshToken = await issueRefreshToken(row);
  return {
    access_token: accessToken,
    token_type: "Bearer" as const,
    expires_in: MCP_ACCESS_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: "mcp",
  };
}

/**
 * Canje del código. El `UPDATE ... WHERE used = false RETURNING` lo marca como usado
 * de forma atómica: dos canjes simultáneos del mismo código no pueden ganar ambos.
 */
export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}) {
  const [row] = await db
    .update(oauthAuthorizationCodes)
    .set({ used: true })
    .where(
      and(
        eq(oauthAuthorizationCodes.codeHash, sha256Hex(input.code)),
        eq(oauthAuthorizationCodes.used, false),
        gt(oauthAuthorizationCodes.expiresAt, sql`now()`),
      ),
    )
    .returning();

  if (!row) {
    throw new OAuthHttpError(400, "invalid_grant", "Código inválido, expirado o ya usado");
  }
  if (row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) {
    throw new OAuthHttpError(400, "invalid_grant", "client_id o redirect_uri no coinciden");
  }
  if (input.codeVerifier.length < 43 || input.codeVerifier.length > 128) {
    throw new OAuthHttpError(400, "invalid_grant", "code_verifier con longitud inválida");
  }
  if (pkceChallengeS256(input.codeVerifier) !== row.codeChallenge) {
    throw new OAuthHttpError(400, "invalid_grant", "PKCE inválido");
  }
  if (input.resource && !resourcesMatch(input.resource, row.resource)) {
    throw new OAuthHttpError(400, "invalid_target", "resource no coincide");
  }

  return tokenResponse(row);
}

/**
 * Rotación del refresh token (atómica). Si llega uno ya revocado, se asume robo y se
 * revocan todos los refresh de ese usuario para ese cliente (detección de reutilización).
 */
export async function rotateRefreshToken(input: { refreshToken: string; clientId: string; resource?: string }) {
  const tokenHash = sha256Hex(input.refreshToken);
  const [row] = await db
    .update(oauthRefreshTokens)
    .set({ revoked: true })
    .where(
      and(
        eq(oauthRefreshTokens.tokenHash, tokenHash),
        eq(oauthRefreshTokens.revoked, false),
        eq(oauthRefreshTokens.clientId, input.clientId),
        gt(oauthRefreshTokens.expiresAt, sql`now()`),
      ),
    )
    .returning();

  if (!row) {
    const [reused] = await db
      .select()
      .from(oauthRefreshTokens)
      .where(and(eq(oauthRefreshTokens.tokenHash, tokenHash), eq(oauthRefreshTokens.revoked, true)))
      .limit(1);
    // Margen de 30 s: un cliente que reintenta el refresh en paralelo (carrera benigna)
    // no debe perder la sesión entera. Solo se revoca la familia fuera de ese margen.
    const [recentSibling] = reused
      ? await db
          .select({ tokenHash: oauthRefreshTokens.tokenHash })
          .from(oauthRefreshTokens)
          .where(
            and(
              eq(oauthRefreshTokens.userId, reused.userId),
              eq(oauthRefreshTokens.clientId, reused.clientId),
              gt(oauthRefreshTokens.createdAt, sql`now() - interval '30 seconds'`),
            ),
          )
          .limit(1)
      : [];
    if (reused && !recentSibling) {
      await db
        .update(oauthRefreshTokens)
        .set({ revoked: true })
        .where(and(eq(oauthRefreshTokens.userId, reused.userId), eq(oauthRefreshTokens.clientId, reused.clientId)));
    }
    throw new OAuthHttpError(400, "invalid_grant", "refresh_token inválido o expirado");
  }
  if (input.resource && !resourcesMatch(input.resource, row.resource)) {
    throw new OAuthHttpError(400, "invalid_target", "resource no coincide");
  }

  return tokenResponse(row);
}

export async function authenticateResourceOwner(email: string, password: string) {
  return loginUser({ email, password });
}

export function expectedMcpResource(): string {
  return mcpResourceUrl();
}

export async function loadUserById(userId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

/** Limpieza periódica: códigos vencidos y refresh tokens vencidos o revocados hace tiempo. */
export async function purgeExpiredOAuthRows(): Promise<void> {
  await db
    .delete(oauthAuthorizationCodes)
    .where(lt(oauthAuthorizationCodes.expiresAt, sql`now() - interval '1 day'`));
  await db
    .delete(oauthRefreshTokens)
    .where(
      or(
        lt(oauthRefreshTokens.expiresAt, sql`now()`),
        and(eq(oauthRefreshTokens.revoked, true), lt(oauthRefreshTokens.createdAt, sql`now() - interval '30 days'`)),
      ),
    );
}
