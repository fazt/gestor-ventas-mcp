import { randomUUID } from "node:crypto";
import {
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth,
} from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { OAuthError, OAuthErrorCode, type AuthInfo, type McpServer } from "@modelcontextprotocol/server";
import type { Request, Response } from "express";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { verifyMcpAccessToken } from "../../lib/jwt.js";
import { mcpResourceUrl } from "../../lib/urls.js";
import type { McpActor } from "./api-client.js";
import { createGestorMcpServer } from "./create-server.js";

type Session = {
  transport: NodeStreamableHTTPServerTransport;
  server: McpServer;
  actor: McpActor;
};

const sessions = new Map<string, Session>();

function isInitializeRequest(body: unknown): boolean {
  return Boolean(
    body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      "method" in body &&
      (body as { method: unknown }).method === "initialize",
  );
}

function actorFromAuth(auth: AuthInfo): McpActor {
  const extra = auth.extra ?? {};
  const id = Number(extra.sub);
  if (!Number.isInteger(id)) {
    throw new OAuthError(OAuthErrorCode.InvalidToken, "Token sin usuario");
  }
  return {
    id,
    name: String(extra.name ?? ""),
    email: String(extra.email ?? ""),
    role: extra.role === "seller" ? "seller" : "admin",
  };
}

const mcpTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const payload = verifyMcpAccessToken(token);
      const decoded = jwt.decode(token) as (jwt.JwtPayload & { client_id?: string }) | null;
      if (!decoded || typeof decoded.exp !== "number") {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "Token sin expiración");
      }

      return {
        token,
        clientId: decoded.client_id ?? "unknown",
        scopes: ["mcp"],
        expiresAt: decoded.exp,
        resource: new URL(mcpResourceUrl()),
        extra: {
          sub: payload.sub,
          role: payload.role,
          email: payload.email,
          name: payload.name,
        },
      };
    } catch (error) {
      if (error instanceof OAuthError) {
        throw error;
      }
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Token MCP inválido");
    }
  },
};

export const mcpBearerAuth = requireBearerAuth({
  verifier: mcpTokenVerifier,
  requiredScopes: ["mcp"],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(mcpResourceUrl())),
});

export const mcpRouter = Router();

mcpRouter.all("/", async (req: Request, res: Response) => {
  try {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: "invalid_token", error_description: "No autenticado" });
      return;
    }

    const actor = actorFromAuth(auth);
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        res.status(404).json({ error: "session_not_found" });
        return;
      }
      if (session.actor.id !== actor.id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === "POST" && isInitializeRequest(req.body)) {
      const transport = new NodeStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          sessions.set(id, session);
        },
        onsessionclosed: (id) => {
          sessions.delete(id);
        },
      });

      const server = createGestorMcpServer(actor);
      const session: Session = { transport, server, actor };
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
      error: "invalid_request",
      error_description: "Se requiere Mcp-Session-Id o un initialize",
    });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ error: "server_error" });
    }
  }
});
