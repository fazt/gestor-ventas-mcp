import { changePasswordSchema, loginSchema } from "@gestor/shared";
import { Router } from "express";
import { AppError } from "../../lib/errors.js";
import { AUTH_COOKIE, authCookieOptions, clearAuthCookieOptions, signWebToken } from "../../lib/jwt.js";
import { loginEmailLimiter, loginIpLimiter, loginLimiter } from "../../lib/rate-limit.js";
import { requireAuth, requireSession } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { changePassword, loginUser } from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/login", loginIpLimiter, loginEmailLimiter, loginLimiter, validate({ body: loginSchema }), async (req, res) => {
  const user = await loginUser(req.body);
  const token = signWebToken({
    sub: String(user.id),
    role: user.role,
    email: user.email,
    name: user.name,
  });
  res.cookie(AUTH_COOKIE, token, authCookieOptions());
  res.json({ user });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, clearAuthCookieOptions());
  res.status(204).send();
});

authRouter.get("/me", requireAuth, (req, res) => {
  if (!req.user) {
    throw new AppError(401, "No autenticado");
  }
  res.json({ user: req.user });
});

authRouter.post(
  "/password",
  requireAuth,
  requireSession,
  loginLimiter,
  validate({ body: changePasswordSchema }),
  async (req, res) => {
    if (!req.user) {
      throw new AppError(401, "No autenticado");
    }
    await changePassword(req.user.id, req.body);
    res.status(204).send();
  },
);
