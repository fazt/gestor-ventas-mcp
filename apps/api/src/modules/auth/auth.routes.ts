import { loginSchema } from "@gestor/shared";
import { Router } from "express";
import { AppError } from "../../lib/errors.js";
import { authCookieOptions, signToken } from "../../lib/jwt.js";
import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { loginUser } from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/login", validate({ body: loginSchema }), async (req, res) => {
  const user = await loginUser(req.body);
  const token = signToken({
    sub: String(user.id),
    role: user.role,
    email: user.email,
    name: user.name,
  });
  res.cookie("token", token, authCookieOptions());
  res.json({ user });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("token", authCookieOptions());
  res.status(204).send();
});

authRouter.get("/me", requireAuth, (req, res) => {
  if (!req.user) {
    throw new AppError(401, "No autenticado");
  }
  res.json({ user: req.user });
});
