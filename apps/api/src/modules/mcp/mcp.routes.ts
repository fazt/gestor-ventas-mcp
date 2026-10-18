import { randomUUID } from "node:crypto";
import {
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth,
} from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { OAuthError, OAuthErrorCode, type AuthInfo, type McpServer } from "@modelcontextprotocol/server";
import type { ApiTokenScope } from "@gestor/shared";
import type { Request, Response } from "express";
import { Router } from "express";
import { isApiTokenFormat, resolveApiToken } from "../../lib/api-tokens.js";
import { env } from "../../lib/env.js";
import { verifyMcpAccessToken } from "../../lib/jwt.js";
import { logger } from "../../lib/logger.js";
import { mcpResourceUrl } from "../../lib/urls.js";
import { loadActiveUser } from "../../middlewares/auth.js";
import type { McpActor } from "./actor.js";
import { createGestorMcpServer } from "./create-server.js";

type Session = {
  transport: NodeStreamableHTTPServerTransport;
  server: McpServer;
  /** Objeto compartido con las tools: se actualiza en cada petición. */
  actor: McpActor;
  lastSeen: number;
};

const sessions = new Map<string, Session>();

/** Identidad que sale del Bearer, antes de releer al usuario en la base. */
type BearerIdentity = {
  userId: number;
  authKind: "oauth" | "pat";
  scopes: ApiTokenScope[];
  clientId: string | null;
  apiTokenId: number | null;
};

function isInitializeRequest(body: unknown): boolean {
  return Boolean(
    body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      "method" in body &&
      (body as { method: unknown }).method === "initialize",
  );
}

/**
 * Acepta dos tipos de Bearer:
 * - JWT emitido por nuestro servidor OAuth (aud = PUBLIC_URL/mcp): lectura y escritura,
 *   limitadas por el rol del usuario.
 * - Token personal `gv_...` creado en el panel: permisos según sus scopes.
 */
const mcpTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (isApiTokenFormat(token)) {
      const principal = await resolveApiToken(token);
      if (!principal) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "Token personal inválido, revocado o vencido");
      }
      // El SDK exige `expiresAt`; para tokens sin vencimiento se usa una ventana corta
      // (el token se vuelve a validar contra la base en cada petición igualmente).
      const expiresAt = principal.expiresAt
        ? Math.floor(principal.expiresAt.getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 3600;
      const identity: BearerIdentity = {
        userId: principal.user.id,
        authKind: "pat",
        scopes: principal.scopes,
        clientId: null,
        apiTokenId: principal.tokenId,
      };
      return {
        token,
        clientId: `pat:${principal.tokenId}`,
        scopes: ["mcp"],
        expiresAt,
        resource: new URL(mcpResourceUrl()),
        extra: identity,
      };
    }

    try {
      const payload = verifyMcpAccessToken(token);
      if (typeof payload.exp !== "number") {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "Token sin expiración");
      }
      const identity: BearerIdentity = {
        userId: Number(payload.sub),
        authKind: "oauth",
        scopes: ["read", "write"],
        clientId: payload.client_id ?? null,
        apiTokenId: null,
      };
      return {
        token,
        clientId: payload.client_id ?? "unknown",
        scopes: ["mcp"],
        expiresAt: payload.exp,
        resource: new URL(mcpResourceUrl()),
        extra: identity,
      };
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Token MCP inválido o expirado");
    }
  },
};

export const mcpBearerAuth = requireBearerAuth({
  verifier: mcpTokenVerifier,
  requiredScopes: ["mcp"],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(mcpResourceUrl())),
});

function identityFrom(auth: AuthInfo): BearerIdentity | null {
  const extra = auth.extra as Partial<BearerIdentity> | undefined;
  if (!extra || !Number.isInteger(extra.userId) || (extra.authKind !== "oauth" && extra.authKind !== "pat")) {
    return null;
  }
  return {
    userId: extra.userId as number,
    authKind: extra.authKind,
    scopes: Array.isArray(extra.scopes) ? extra.scopes : [],
    clientId: extra.clientId ?? null,
    apiTokenId: extra.apiTokenId ?? null,
  };
}

/** Relee al usuario (rol/estado) y arma el actor de esta petición. */
async function actorFor(identity: BearerIdentity): Promise<McpActor | null> {
  try {
    const user = await loadActiveUser(identity.userId);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      authKind: identity.authKind,
      scopes: identity.scopes,
      clientId: identity.clientId,
      apiTokenId: identity.apiTokenId,
    };
  } catch {
    return null;
  }
}

function closeSession(id: string, session: Session): void {
  sessions.delete(id);
  void session.transport.close().catch(() => undefined);
  void session.server.close().catch(() => undefined);
}

/** Cierra sesiones inactivas. Se llama periódicamente desde server.ts. */
export function sweepMcpSessions(now = Date.now()): number {
  const ttl = env.MCP_SESSION_TTL_MINUTES * 60_000;
  let closed = 0;
  for (const [id, session] of sessions) {
    if (now - session.lastSeen > ttl) {
      closeSession(id, session);
      closed += 1;
    }
  }
  return closed;
}

/** Limita las sesiones abiertas por usuario: cierra las más antiguas. */
function enforceSessionLimit(userId: number): void {
  const own = [...sessions.entries()]
    .filter(([, session]) => session.actor.id === userId)
    .sort(([, a], [, b]) => a.lastSeen - b.lastSeen);
  while (own.length >= env.MCP_MAX_SESSIONS_PER_USER) {
    const oldest = own.shift();
    if (!oldest) break;
    closeSession(oldest[0], oldest[1]);
  }
}

export function closeAllMcpSessions(): void {
  for (const [id, session] of sessions) {
    closeSession(id, session);
  }
}

export function mcpSessionCount(): number {
  return sessions.size;
}

export const mcpRouter = Router();

mcpRouter.all("/", async (req: Request, res: Response) => {
  try {
    const auth = req.auth;
    const identity = auth ? identityFrom(auth) : null;
    if (!identity) {
      res.status(401).json({ error: "invalid_token", error_description: "No autenticado" });
      return;
    }
    const actor = await actorFor(identity);
    if (!actor) {
      res.status(401).json({ error: "invalid_token", error_description: "Usuario inactivo o inexistente" });
      return;
    }

    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: "Sesión no encontrada" }, id: null });
        return;
      }
      if (session.actor.id !== actor.id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      // Rol, scopes o token pueden haber cambiado: las tools leen siempre este objeto.
      Object.assign(session.actor, actor);
      session.lastSeen = Date.now();
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === "POST" && isInitializeRequest(req.body)) {
      enforceSessionLimit(actor.id);
      const server = createGestorMcpServer(actor);
      const transport: NodeStreamableHTTPServerTransport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          sessions.set(id, session);
        },
        onsessionclosed: (id) => {
          sessions.delete(id);
        },
      });
      const session: Session = { transport, server, actor, lastSeen: Date.now() };
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Se requiere Mcp-Session-Id o una petición initialize" },
      id: null,
    });
  } catch (error) {
    logger.error({ err: error }, "Error en el endpoint MCP");
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Error interno" }, id: null });
    }
  }
});
