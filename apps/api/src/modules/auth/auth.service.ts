import { db, users } from "@gestor/db";
import type { ChangePasswordInput, LoginInput, PublicUser } from "@gestor/shared";
import { eq, sql } from "drizzle-orm";
import { AppError } from "../../lib/errors.js";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../../lib/password.js";
import { toPublicUser } from "../../lib/serialize.js";

export async function loginUser(input: LoginInput): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid || !user.isActive) {
    throw new AppError(401, "Credenciales inválidas");
  }

  return toPublicUser(user);
}

export async function changePassword(userId: number, input: ChangePasswordInput): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new AppError(404, "Usuario no encontrado");
  }
  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw new AppError(400, "La contraseña actual no es correcta");
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
    .where(eq(users.id, userId));
}
