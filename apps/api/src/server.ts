import { closeDb } from "@gestor/db";
import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { mcpResourceUrl } from "./lib/urls.js";
import { purgeOldAuditLogs } from "./modules/mcp/audit.js";
import { closeAllMcpSessions, sweepMcpSessions } from "./modules/mcp/mcp.routes.js";
import { purgeExpiredOAuthRows } from "./modules/oauth/oauth.service.js";

const app = createApp();

const server = app.listen(env.PORT, "0.0.0.0", () => {
  logger.info(
    { port: env.PORT, docs: `${env.PUBLIC_URL}/api/docs`, mcp: mcpResourceUrl(), timezone: env.STORE_TIMEZONE },
    "API escuchando",
  );
});

// Mantenimiento: sesiones MCP inactivas cada minuto; limpieza de OAuth y bitácora cada 6 h.
const sweepTimer = setInterval(() => {
  const closed = sweepMcpSessions();
  if (closed > 0) logger.debug({ closed }, "Sesiones MCP inactivas cerradas");
}, 60_000);
sweepTimer.unref();

async function housekeeping() {
  try {
    await purgeExpiredOAuthRows();
    const purged = await purgeOldAuditLogs();
    if (purged > 0) logger.info({ purged }, "Bitácora MCP purgada");
  } catch (error) {
    logger.warn({ err: error }, "Fallo en la limpieza periódica");
  }
}
const housekeepingTimer = setInterval(() => void housekeeping(), 6 * 60 * 60 * 1000);
housekeepingTimer.unref();
setTimeout(() => void housekeeping(), 30_000).unref();

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Apagando: dejando de aceptar conexiones");
  clearInterval(sweepTimer);
  clearInterval(housekeepingTimer);
  closeAllMcpSessions();

  const force = setTimeout(() => {
    logger.error("Apagado forzado tras 10 s");
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close(() => {
    closeDb()
      .catch(() => undefined)
      .finally(() => {
        logger.info("Apagado completo");
        process.exit(0);
      });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Promesa rechazada sin manejar");
});
