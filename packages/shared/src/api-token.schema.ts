/// <reference types="zod-openapi" />
import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema.js";

/**
 * Permisos de un token personal:
 * - `read`: consultar catálogo, ventas, inventario y métricas.
 * - `write`: además registrar/cancelar ventas, ajustar stock y editar catálogo
 *   (siempre limitado por el rol del usuario dueño del token).
 */
export const apiTokenScopeSchema = z.enum(["read", "write"]).meta({ id: "ApiTokenScope", example: "read" });

export const apiTokenSchema = z
  .object({
    id: z.number().int().meta({ example: 1 }),
    name: z.string().meta({ example: "Claude Code (laptop)" }),
    tokenPrefix: z.string().meta({ example: "gv_3fA9c1" }),
    scopes: z.array(apiTokenScopeSchema),
    lastUsedAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
    revokedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: "ApiToken" });

export const createApiTokenSchema = z
  .object({
    name: z.string().trim().min(2).max(100).meta({ example: "Claude Code (laptop)" }),
    scopes: z.array(apiTokenScopeSchema).min(1).max(2).default(["read"]),
    expiresInDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .nullable()
      .default(90)
      .meta({ description: "null = sin vencimiento", example: 90 }),
  })
  .meta({ id: "CreateApiToken" });

export const createdApiTokenSchema = apiTokenSchema
  .extend({
    token: z.string().meta({ description: "Se muestra una sola vez", example: "gv_3fA9c1..." }),
  })
  .meta({ id: "CreatedApiToken" });

export const mcpAuditLogSchema = z
  .object({
    id: z.number().int(),
    userId: z.number().int(),
    userName: z.string().nullable(),
    authKind: z.enum(["oauth", "pat"]),
    clientId: z.string().nullable(),
    apiTokenId: z.number().int().nullable(),
    tool: z.string(),
    ok: z.boolean(),
    error: z.string().nullable(),
    durationMs: z.number().int(),
    args: z.unknown().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: "McpAuditLog" });

export const mcpAuditQuerySchema = paginationQuerySchema
  .extend({
    tool: z.string().trim().max(64).optional(),
    ok: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  })
  .meta({ id: "McpAuditQuery" });

export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;
export type ApiToken = z.infer<typeof apiTokenSchema>;
export type CreateApiTokenInput = z.input<typeof createApiTokenSchema>;
export type CreateApiTokenData = z.infer<typeof createApiTokenSchema>;
export type CreatedApiToken = z.infer<typeof createdApiTokenSchema>;
export type McpAuditLog = z.infer<typeof mcpAuditLogSchema>;
export type McpAuditQuery = z.infer<typeof mcpAuditQuerySchema>;
export type McpAuditParams = z.input<typeof mcpAuditQuerySchema>;
