import { db, mcpAuditLogs } from "@gestor/db";
import { lt, sql } from "drizzle-orm";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import type { McpActor } from "./actor.js";

const SENSITIVE_KEYS = /pass|token|secret|authorization|cookie/i;

/** Copia acotada de los argumentos: sin secretos, textos largos recortados, poca profundidad. */
export function sanitizeArgs(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 3) return "[…]";
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((item) => sanitizeArgs(item, depth + 1));
    return value.length > 20 ? [...items, `… ${value.length - 20} más`] : items;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      out[key] = SENSITIVE_KEYS.test(key) ? "[oculto]" : sanitizeArgs(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function recordToolCall(entry: {
  actor: McpActor;
  tool: string;
  args: unknown;
  ok: boolean;
  error?: string | null;
  durationMs: number;
}): void {
  // Sin await: la bitácora no debe frenar ni romper la respuesta al agente.
  void db
    .insert(mcpAuditLogs)
    .values({
      userId: entry.actor.id,
      authKind: entry.actor.authKind,
      clientId: entry.actor.clientId,
      apiTokenId: entry.actor.apiTokenId,
      tool: entry.tool,
      ok: entry.ok,
      error: entry.error ? entry.error.slice(0, 1000) : null,
      durationMs: Math.max(0, Math.round(entry.durationMs)),
      args: sanitizeArgs(entry.args) as object | null,
    })
    .catch((error: unknown) => logger.warn({ err: error, tool: entry.tool }, "No se pudo guardar la bitácora MCP"));
}

/** Purga periódica según MCP_AUDIT_RETENTION_DAYS (0 = conservar todo). */
export async function purgeOldAuditLogs(): Promise<number> {
  if (env.MCP_AUDIT_RETENTION_DAYS <= 0) return 0;
  const deleted = await db
    .delete(mcpAuditLogs)
    .where(lt(mcpAuditLogs.createdAt, sql`now() - make_interval(days => ${env.MCP_AUDIT_RETENTION_DAYS})`))
    .returning({ id: mcpAuditLogs.id });
  return deleted.length;
}
