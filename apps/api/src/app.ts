import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import {
  hostHeaderValidation,
  mcpAuthMetadataRouter,
} from "@modelcontextprotocol/express";
import { env } from "./lib/env.js";
import { mcpAllowedHosts, mcpResourceUrl } from "./lib/urls.js";
import { requireAuth } from "./middlewares/auth.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { categoriesRouter } from "./modules/categories/categories.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { mcpBearerAuth, mcpRouter } from "./modules/mcp/mcp.routes.js";
import { oauthRouter } from "./modules/oauth/oauth.routes.js";
import { authorizationServerMetadata } from "./modules/oauth/oauth.metadata.js";
import { productsRouter } from "./modules/products/products.routes.js";
import { salesRouter } from "./modules/sales/sales.routes.js";
import { docsRouter } from "./docs/swagger.js";

function isMcpSurface(path: string): boolean {
  return (
    path === "/mcp" ||
    path.startsWith("/mcp/") ||
    path.startsWith("/oauth") ||
    path.startsWith("/.well-known")
  );
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.use((req, res, next) => {
    if (!isMcpSurface(req.path)) {
      next();
      return;
    }

    const origin = req.headers.origin;
    res.header("Access-Control-Allow-Origin", origin ?? "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Mcp-Session-Id, Last-Event-ID, MCP-Protocol-Version",
    );
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use((req, res, next) => {
    if (isMcpSurface(req.path)) {
      next();
      return;
    }
    cors({ origin: env.WEB_ORIGIN, credentials: true })(req, res, next);
  });
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata: authorizationServerMetadata(),
      resourceServerUrl: new URL(mcpResourceUrl()),
      scopesSupported: ["mcp"],
      resourceName: "Gestor de ventas MCP",
      dangerouslyAllowInsecureIssuerUrl: env.NODE_ENV !== "production",
    }),
  );

  app.use("/oauth", oauthRouter);

  app.use(
    "/mcp",
    hostHeaderValidation(mcpAllowedHosts()),
    mcpBearerAuth,
    mcpRouter,
  );

  app.use("/api", docsRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/categories", requireAuth, categoriesRouter);
  app.use("/api/products", requireAuth, productsRouter);
  app.use("/api/sales", requireAuth, salesRouter);
  app.use("/api/inventory", requireAuth, inventoryRouter);
  app.use("/api/dashboard", requireAuth, dashboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
