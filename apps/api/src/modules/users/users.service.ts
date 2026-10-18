import { apiTokens, db, users } from "@gestor/db";
import type { CreateUserData, UpdateUserInput } from "@gestor/shared";
import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import { AppError, isUniqueViolation } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { toUser } from "../../lib/serialize.js";

export async function listUsers() {
  const rows = await db.select().from(users).orderBy(asc(users.name));
  return { data: rows.map(toUser) };
}

export async function createUser(input: CreateUserData) {
  try {
    const [row] = await db
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: input.role,
        isActive: true,
      })
      .returning();
    if (!row) throw new AppError(500, "No se pudo crear el usuario");
    return toUser(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "Ya existe un usuario con ese correo");
    }
    throw error;
  }
}

async function activeAdminsExcept(userId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, userId)));
  return row?.value ?? 0;
}

/**
 * Edición por un admin. Protege contra quedarse sin administradores activos y contra
 * que un admin se desactive o se quite el rol a sí mismo por error.
 */
export async function updateUser(actorId: number, id: number, input: UpdateUserInput) {
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) throw new AppError(404, "Usuario no encontrado");

  const losesAdmin =
    existing.role === "admin" &&
    existing.isActive &&
    ((input.role !== undefined && input.role !== "admin") || input.isActive === false);
  if (losesAdmin) {
    if (actorId === id) {
      throw new AppError(400, "No puedes quitarte el rol de administrador ni desactivarte");
    }
    if ((await activeAdminsExcept(id)) === 0) {
      throw new AppError(400, "Debe quedar al menos un administrador activo");
    }
  }

  const [row] = await db
    .update(users)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password !== undefined ? { passwordHash: await hashPassword(input.password) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();
  if (!row) throw new AppError(404, "Usuario no encontrado");

  // Desactivar a alguien corta también sus integraciones (tokens personales).
  if (input.isActive === false) {
    await db
      .update(apiTokens)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(apiTokens.userId, id), isNull(apiTokens.revokedAt)));
  }

  return toUser(row);
}
