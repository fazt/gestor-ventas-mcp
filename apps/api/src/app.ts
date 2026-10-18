import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import {
  hostHeaderValidation,
  mcpAuthMetadataRouter,
} from "@modelcontextprotocol/express";
import { pool } from "@gestor/db";
import { docsRouter } from "./docs/swagger.js";
import { env, isProduction } from "./lib/env.js";
import { logger, stripQuery } from "./lib/logger.js";
import { apiLimiter, mcpLimiter } from "./lib/rate-limit.js";
import { mcpAllowedHosts, mcpResourceUrl } from "./lib/urls.js";
import { requireAuth } from "./middlewares/auth.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { categoriesRouter } from "./modules/categories/categories.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { mcpBearerAuth, mcpRouter, mcpSessionCount } from "./modules/mcp/mcp.routes.js";
import { authorizationServerMetadata } from "./modules/oauth/oauth.metadata.js";
import { oauthRouter } from "./modules/oauth/oauth.routes.js";
import { productsRouter } from "./modules/products/products.routes.js";
import { salesRouter } from "./modules/sales/sales.routes.js";
import { mcpActivityRouter, tokensRouter } from "./modules/tokens/tokens.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

function isMcpSurface(path: string): boolean {
  return (
    path === "/mcp" ||
    path.startsWith("/mcp/") ||
    path.startsWith("/oauth/register") ||
    path.startsWith("/oauth/token") ||
    path.startsWith("/.well-known")
  );
}

/**
 * CORS de la superficie MCP/OAuth: abierta a cualquier origen (los hosts MCP web la
 * llaman desde su dominio) pero SIN credenciales: allí solo vale el Bearer, nunca la
 * cookie del panel. `/oauth/authorize` es navegación normal y no necesita CORS.
 */
function mcpCors(req: Request, res: Response, next: NextFunction): void {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Mcp-Session-Id, Last-Event-ID, MCP-Protocol-Version",
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
  res.header("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

export function createApp() {
  const app = express();
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      // Sin query string: en OAuth viajan `code`, `state` y `code_challenge`.
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: stripQuery(req.url),
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === "/health" || req.url === "/health/ready" },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
    }),
  );

  app.use(
    helmet({
      // La API solo sirve JSON, Swagger UI y las páginas OAuth (que fijan su propia CSP).
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: isProduction ? undefined : false,
    }),
  );

  app.use((req, res, next) => {
    if (isMcpSurface(req.path)) {
      mcpCors(req, res, next);
      return;
    }
    cors({
      origin: (origin, callback) => {
        // Sin Origin (curl, server-to-server, proxy de Next) o un origen del panel.
        callback(null, !origin || env.WEB_ORIGINS.includes(origin));
      },
      credentials: true,
    })(req, res, next);
  });

  app.use(cookieParser());
  app.use(express.json({ limit: "200kb" }));
  app.use(express.urlencoded({ extended: false, limit: "50kb" }));

  // Liveness: el proceso responde.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Readiness: además llega a la base de datos.
  app.get("/health/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", db: "ok", mcpSessions: mcpSessionCount() });
    } catch {
      res.status(503).json({ status: "error", db: "unreachable" });
    }
  });

  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata: authorizationServerMetadata(),
      resourceServerUrl: new URL(mcpResourceUrl()),
      scopesSupported: ["mcp"],
      resourceName: `${env.STORE_NAME} (MCP)`,
      dangerouslyAllowInsecureIssuerUrl: !isProduction,
    }),
  );

  app.use("/oauth", oauthRouter);

  app.use("/mcp", mcpLimiter, hostHeaderValidation(mcpAllowedHosts()), mcpBearerAuth, mcpRouter);

  app.use("/api", docsRouter);
  app.use("/api", apiLimiter);
  app.use("/api/auth", authRouter);
  app.use("/api/categories", requireAuth, categoriesRouter);
  app.use("/api/products", requireAuth, productsRouter);
  app.use("/api/sales", requireAuth, salesRouter);
  app.use("/api/inventory", requireAuth, inventoryRouter);
  app.use("/api/dashboard", requireAuth, dashboardRouter);
  app.use("/api/users", requireAuth, usersRouter);
  app.use("/api/tokens", requireAuth, tokensRouter);
  app.use("/api/mcp/activity", requireAuth, mcpActivityRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
