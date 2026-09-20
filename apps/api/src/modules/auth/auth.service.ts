import { db, users } from "@gestor/db";
import type { LoginInput, PublicUser } from "@gestor/shared";
import { eq } from "drizzle-orm";
import { AppError } from "../../lib/errors.js";
import { verifyPassword } from "../../lib/password.js";
import { toPublicUser } from "../../lib/serialize.js";

export async function loginUser(input: LoginInput): Promise<PublicUser & { id: number }> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  if (!user || !user.isActive) {
    throw new AppError(401, "Credenciales inválidas");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Credenciales inválidas");
  }

  return toPublicUser(user);
}
