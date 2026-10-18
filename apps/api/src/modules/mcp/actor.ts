import type { ApiTokenScope, UserRole } from "@gestor/shared";

/**
 * Quién está detrás de una sesión MCP. Se refresca en cada petición (rol, estado y
 * permisos del token pueden cambiar mientras la sesión sigue abierta).
 */
export type McpActor = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  /** `oauth`: conector con login (Claude.ai, ChatGPT, Cursor). `pat`: token personal. */
  authKind: "oauth" | "pat";
  scopes: ApiTokenScope[];
  clientId: string | null;
  apiTokenId: number | null;
};

export type ToolAccess = "read" | "write" | "admin";

export function canWrite(actor: McpActor): boolean {
  return actor.scopes.includes("write");
}

/** Devuelve el motivo si el actor no puede usar una tool de ese nivel, o null si puede. */
export function accessDenied(actor: McpActor, access: ToolAccess): string | null {
  if (access === "read") return null;
  if (!canWrite(actor)) {
    return "Este token es de solo lectura: crea uno con permiso de escritura en Integraciones";
  }
  if (access === "admin" && actor.role !== "admin") {
    return "Solo un administrador puede modificar el catálogo";
  }
  return null;
}
