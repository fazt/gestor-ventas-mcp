import { categories, db } from "@gestor/db";
import type { CreateCategoryInput, UpdateCategoryInput } from "@gestor/shared";
import { asc, eq } from "drizzle-orm";
import { AppError, isForeignKeyViolation, isUniqueViolation } from "../../lib/errors.js";
import { toCategory } from "../../lib/serialize.js";

export async function listCategories() {
  const rows = await db.select().from(categories).orderBy(asc(categories.name));
  return { data: rows.map(toCategory) };
}

export async function getCategory(id: number) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!row) {
    throw new AppError(404, "Categoría no encontrada");
  }
  return toCategory(row);
}

export async function createCategory(input: CreateCategoryInput) {
  try {
    const [row] = await db
      .insert(categories)
      .values({
        name: input.name,
        description: input.description ?? null,
      })
      .returning();
    if (!row) {
      throw new AppError(500, "No se pudo crear la categoría");
    }
    return toCategory(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "Ya existe una categoría con ese nombre");
    }
    throw error;
  }
}

export async function updateCategory(id: number, input: UpdateCategoryInput) {
  const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!existing) {
    throw new AppError(404, "Categoría no encontrada");
  }

  try {
    const [row] = await db
      .update(categories)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        updatedAt: new Date(),
      })
      .where(eq(categories.id, id))
      .returning();
    if (!row) {
      throw new AppError(404, "Categoría no encontrada");
    }
    return toCategory(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "Ya existe una categoría con ese nombre");
    }
    throw error;
  }
}

export async function deleteCategory(id: number) {
  const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!existing) {
    throw new AppError(404, "Categoría no encontrada");
  }

  try {
    await db.delete(categories).where(eq(categories.id, id));
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new AppError(409, "No se puede eliminar: hay productos asociados");
    }
    throw error;
  }
}
