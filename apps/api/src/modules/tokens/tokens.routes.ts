import { createApiTokenSchema, mcpAuditQuerySchema } from "@gestor/shared";
import { Router } from "express";
import { AppError } from "../../lib/errors.js";
import { idParamSchema } from "../../lib/params.js";
import { sensitiveActionLimiter } from "../../lib/rate-limit.js";
import { mcpResourceUrl } from "../../lib/urls.js";
import { requireSession } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { createApiToken, listApiTokens, listMcpActivity, revokeApiToken } from "./tokens.service.js";

/**
 * Tokens personales del usuario en sesión. Solo desde el panel: un token no puede
 * crear otros tokens (evita que una integración comprometida se perpetúe).
 */
export const tokensRouter = Router();

tokensRouter.use(requireSession);

tokensRouter.get("/", async (req, res) => {
  if (!req.user) throw new AppError(401, "No autenticado");
  res.json({ ...(await listApiTokens(req.user.id)), mcpUrl: mcpResourceUrl() });
});

tokensRouter.post("/", sensitiveActionLimiter, validate({ body: createApiTokenSchema }), async (req, res) => {
  if (!req.user) throw new AppError(401, "No autenticado");
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(await createApiToken(req.user.id, req.body));
});

tokensRouter.delete("/:id", validate({ params: idParamSchema }), async (req, res) => {
  if (!req.user) throw new AppError(401, "No autenticado");
  res.json(await revokeApiToken(req.user.id, Number(req.params.id)));
});

export const mcpActivityRouter = Router();

mcpActivityRouter.get("/", async (req, res) => {
  if (!req.user) throw new AppError(401, "No autenticado");
  const query = mcpAuditQuerySchema.parse(req.query);
  res.json(await listMcpActivity(req.user, query));
});
