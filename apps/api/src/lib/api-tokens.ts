import { apiTokens, db, users } from "@gestor/db";
import type { ApiTokenScope, UserRole } from "@gestor/shared";
import { and, eq, isNull } from "drizzle-orm";
import { randomToken, sha256Hex } from "./crypto.js";

/** Prefijo reconocible: permite distinguirlo de un JWT y detectarlo con secret scanning. */
export const API_TOKEN_PREFIX = "gv_";

export function isApiTokenFormat(token: string): boolean {
  return token.startsWith(API_TOKEN_PREFIX) && token.length >= 20 && token.length <= 128;
}

export function generateApiToken(): { token: string; prefix: string; hash: string } {
  const token = `${API_TOKEN_PREFIX}${randomToken(32)}`;
  return {
    token,
    prefix: token.slice(0, API_TOKEN_PREFIX.length + 6),
    hash: sha256Hex(token),
  };
}

export type ApiTokenPrincipal = {
  tokenId: number;
  scopes: ApiTokenScope[];
  expiresAt: Date | null;
  user: { id: number; name: string; email: string; role: UserRole; isActive: boolean };
};

const LAST_USED_THROTTLE_MS = 60_000;

/**
 * Valida un token personal: existe, no está revocado ni vencido y su dueño sigue activo.
 * Devuelve `null` si no sirve (el llamador responde 401).
 */
export async function resolveApiToken(token: string): Promise<ApiTokenPrincipal | null> {
  if (!isApiTokenFormat(token)) return null;

  const [row] = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(and(eq(apiTokens.tokenHash, sha256Hex(token)), isNull(apiTokens.revokedAt)))
    .limit(1);

  if (!row || !row.user.isActive) return null;
  if (row.token.expiresAt && row.token.expiresAt.getTime() <= Date.now()) return null;

  const lastUsed = row.token.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - lastUsed > LAST_USED_THROTTLE_MS) {
    // Sin await: no bloquea la petición y un fallo aquí no debe romperla.
    void db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.token.id))
      .catch(() => undefined);
  }

  const scopes = (Array.isArray(row.token.scopes) ? row.token.scopes : []).filter(
    (scope): scope is ApiTokenScope => scope === "read" || scope === "write",
  );

  return {
    tokenId: row.token.id,
    scopes,
    expiresAt: row.token.expiresAt,
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      role: row.user.role,
      isActive: row.user.isActive,
    },
  };
}
