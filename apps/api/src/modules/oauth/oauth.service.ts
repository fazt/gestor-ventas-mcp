import {
  oauthAuthorizationCodes,
  oauthClients,
  oauthRefreshTokens,
  users,
} from "@gestor/db";
import { db } from "@gestor/db";
import { eq } from "drizzle-orm";
import {
  newClientId,
  pkceChallengeS256,
  randomToken,
  sha256Hex,
} from "../../lib/crypto.js";
import { MCP_ACCESS_TTL_SECONDS, signMcpAccessToken } from "../../lib/jwt.js";
import { mcpResourceUrl } from "../../lib/urls.js";
import { loginUser } from "../auth/auth.service.js";
import { OAuthHttpError } from "./oauth.errors.js";

const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const REFRESH_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type OAuthClient = typeof oauthClients.$inferSelect;

const BLOCKED_REDIRECT_SCHEMES = new Set([
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "about:",
]);

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost")
  );
}

export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    const protocol = parsed.protocol.toLowerCase();

    if (BLOCKED_REDIRECT_SCHEMES.has(protocol)) {
      return false;
    }

    if (protocol === "https:") {
      return true;
    }

    if (protocol === "http:") {
      return isLoopbackHostname(parsed.hostname);
    }

    // Native MCP hosts (Cursor, VS Code) use private-use URI schemes (RFC 8252).
    return /^[a-z][a-z0-9+.-]*:$/.test(protocol);
  } catch {
    return false;
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
  grant_types?: unknown;
  response_types?: unknown;
}) {
  const redirectUris = Array.isArray(input.redirect_uris)
    ? input.redirect_uris.filter((uri): uri is string => typeof uri === "string")
    : [];

  if (redirectUris.length === 0) {
    throw new OAuthHttpError(400, "invalid_client_metadata", "redirect_uris es obligatorio");
  }

  if (!redirectUris.every(isAllowedRedirectUri)) {
    throw new OAuthHttpError(
      400,
      "invalid_redirect_uri",
      "redirect_uri debe ser https, loopback http o un esquema nativo (p. ej. cursor://)",
    );
  }

  const clientId = newClientId();
  await db.insert(oauthClients).values({
    clientId,
    clientName: input.client_name ?? "MCP client",
    redirectUris,
    tokenEndpointAuthMethod: input.token_endpoint_auth_method ?? "none",
  });

  return {
    client_id: clientId,
    client_name: input.client_name ?? "MCP client",
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
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  if (!client) {
    throw new OAuthHttpError(400, "invalid_client", "client_id desconocido");
  }
  return client;
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

async function issueRefreshToken(input: {
  clientId: string;
  userId: number;
  resource: string;
}): Promise<string> {
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
    throw new OAuthHttpError(400, "invalid_grant", "Usuario inválido");
  }
  return {
    sub: String(user.id),
    role: user.role,
    email: user.email,
    name: user.name,
  };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}) {
  const [row] = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.codeHash, sha256Hex(input.code)))
    .limit(1);

  if (!row || row.used) {
    throw new OAuthHttpError(400, "invalid_grant", "Código inválido");
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new OAuthHttpError(400, "invalid_grant", "Código expirado");
  }
  if (row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) {
    throw new OAuthHttpError(400, "invalid_grant", "client_id o redirect_uri no coinciden");
  }
  if (pkceChallengeS256(input.codeVerifier) !== row.codeChallenge) {
    throw new OAuthHttpError(400, "invalid_grant", "PKCE inválido");
  }
  if (input.resource && !resourcesMatch(input.resource, row.resource)) {
    throw new OAuthHttpError(400, "invalid_target", "resource no coincide");
  }

  await db
    .update(oauthAuthorizationCodes)
    .set({ used: true })
    .where(eq(oauthAuthorizationCodes.codeHash, row.codeHash));

  const claims = await userClaims(row.userId);
  const accessToken = signMcpAccessToken({ ...claims, clientId: row.clientId });
  const refreshToken = await issueRefreshToken({
    clientId: row.clientId,
    userId: row.userId,
    resource: row.resource,
  });

  return {
    access_token: accessToken,
    token_type: "Bearer" as const,
    expires_in: MCP_ACCESS_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: "mcp",
  };
}

export async function rotateRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  resource?: string;
}) {
  const [row] = await db
    .select()
    .from(oauthRefreshTokens)
    .where(eq(oauthRefreshTokens.tokenHash, sha256Hex(input.refreshToken)))
    .limit(1);

  if (!row || row.revoked || row.clientId !== input.clientId) {
    throw new OAuthHttpError(400, "invalid_grant", "refresh_token inválido");
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new OAuthHttpError(400, "invalid_grant", "refresh_token expirado");
  }
  if (input.resource && !resourcesMatch(input.resource, row.resource)) {
    throw new OAuthHttpError(400, "invalid_target", "resource no coincide");
  }

  await db
    .update(oauthRefreshTokens)
    .set({ revoked: true })
    .where(eq(oauthRefreshTokens.tokenHash, row.tokenHash));

  const claims = await userClaims(row.userId);
  const accessToken = signMcpAccessToken({ ...claims, clientId: row.clientId });
  const refreshToken = await issueRefreshToken({
    clientId: row.clientId,
    userId: row.userId,
    resource: row.resource,
  });

  return {
    access_token: accessToken,
    token_type: "Bearer" as const,
    expires_in: MCP_ACCESS_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: "mcp",
  };
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
