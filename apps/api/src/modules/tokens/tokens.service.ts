import { apiTokens, db, mcpAuditLogs, users } from "@gestor/db";
import type { CreateApiTokenData, CreatedApiToken, McpAuditLog, McpAuditQuery, UserRole } from "@gestor/shared";
import { and, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { generateApiToken } from "../../lib/api-tokens.js";
import { AppError } from "../../lib/errors.js";
import { toApiToken } from "../../lib/serialize.js";

const MAX_ACTIVE_TOKENS_PER_USER = 20;

export async function listApiTokens(userId: number) {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))
    .limit(100);
  return { data: rows.map(toApiToken) };
}

export async function createApiToken(userId: number, input: CreateApiTokenData): Promise<CreatedApiToken> {
  const [active] = await db
    .select({ value: count() })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
  if ((active?.value ?? 0) >= MAX_ACTIVE_TOKENS_PER_USER) {
    throw new AppError(409, `Máximo ${MAX_ACTIVE_TOKENS_PER_USER} tokens activos: revoca alguno antes de crear otro`);
  }

  const scopes = [...new Set(input.scopes)];
  // `write` implica poder leer.
  if (scopes.includes("write") && !scopes.includes("read")) scopes.unshift("read");

  const { token, prefix, hash } = generateApiToken();
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId,
      name: input.name,
      tokenPrefix: prefix,
      tokenHash: hash,
      scopes,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    })
    .returning();
  if (!row) throw new AppError(500, "No se pudo crear el token");
  return { ...toApiToken(row), token };
}

export async function revokeApiToken(userId: number, tokenId: number) {
  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning();
  if (!row) {
    // 404 también si es de otro usuario: no se revela que existe.
    throw new AppError(404, "Token no encontrado o ya revocado");
  }
  return toApiToken(row);
}

/** Bitácora MCP: un admin ve la de todo el equipo; un vendedor, solo la suya. */
export async function listMcpActivity(actor: { id: number; role: UserRole }, query: McpAuditQuery) {
  const clauses: SQL[] = [];
  if (actor.role !== "admin") clauses.push(eq(mcpAuditLogs.userId, actor.id));
  if (query.tool) clauses.push(eq(mcpAuditLogs.tool, query.tool));
  if (query.ok !== undefined) clauses.push(eq(mcpAuditLogs.ok, query.ok));
  const where = clauses.length ? and(...clauses) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(mcpAuditLogs).where(where);
  const rows = await db
    .select({ log: mcpAuditLogs, userName: users.name })
    .from(mcpAuditLogs)
    .leftJoin(users, eq(users.id, mcpAuditLogs.userId))
    .where(where)
    .orderBy(desc(mcpAuditLogs.createdAt), desc(mcpAuditLogs.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const data: McpAuditLog[] = rows.map(({ log, userName }) => ({
    id: log.id,
    userId: log.userId,
    userName,
    authKind: log.authKind === "pat" ? "pat" : "oauth",
    clientId: log.clientId,
    apiTokenId: log.apiTokenId,
    tool: log.tool,
    ok: log.ok,
    error: log.error,
    durationMs: log.durationMs,
    args: log.args ?? null,
    createdAt: log.createdAt.toISOString(),
  }));

  return { data, total: totalRow?.value ?? 0, page: query.page, pageSize: query.pageSize };
}
