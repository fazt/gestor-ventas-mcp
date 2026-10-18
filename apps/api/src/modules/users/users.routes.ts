import { createUserSchema, updateUserSchema } from "@gestor/shared";
import { Router } from "express";
import { AppError } from "../../lib/errors.js";
import { idParamSchema } from "../../lib/params.js";
import { sensitiveActionLimiter } from "../../lib/rate-limit.js";
import { requireSession } from "../../middlewares/auth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { validate } from "../../middlewares/validate.js";
import { createUser, listUsers, updateUser } from "./users.service.js";

/** Gestión del equipo: solo administradores y solo desde la sesión del panel. */
export const usersRouter = Router();

usersRouter.use(requireSession, requireRole("admin"));

usersRouter.get("/", async (_req, res) => {
  res.json(await listUsers());
});

usersRouter.post("/", sensitiveActionLimiter, validate({ body: createUserSchema }), async (req, res) => {
  res.status(201).json(await createUser(req.body));
});

usersRouter.patch(
  "/:id",
  sensitiveActionLimiter,
  validate({ params: idParamSchema, body: updateUserSchema }),
  async (req, res) => {
    if (!req.user) throw new AppError(401, "No autenticado");
    res.json(await updateUser(req.user.id, Number(req.params.id), req.body));
  },
);
