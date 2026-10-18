import { pino } from "pino";
import { env, isProduction, isTest } from "./env.js";

/** Logger estructurado (JSON). En test se silencia para no ensuciar la salida. */
export const logger = pino({
  level: isTest ? "silent" : (env.LOG_LEVEL ?? (isProduction ? "info" : "debug")),
  base: { service: "gestor-ventas-api" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.token",
      "*.refresh_token",
      "*.code_verifier",
    ],
    censor: "[oculto]",
  },
});

/**
 * Quita la query string de una URL antes de loguearla: en /oauth/authorize y en el
 * callback viajan `code`, `state` y `code_challenge`, que no deben quedar en los logs.
 */
export function stripQuery(url: string | undefined): string {
  if (!url) return "";
  const index = url.indexOf("?");
  return index === -1 ? url : url.slice(0, index);
}
