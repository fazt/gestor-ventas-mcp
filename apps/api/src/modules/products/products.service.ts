import { categories, db, products, stockMovements } from "@gestor/db";
import type { CreateProductData, ProductListQuery, UpdateProductInput } from "@gestor/shared";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { AppError, isUniqueViolation } from "../../lib/errors.js";
import { toProduct } from "../../lib/serialize.js";

export function escapeIlike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function productFilters(query: ProductListQuery): SQL | undefined {
  const clauses: SQL[] = [];
  if (query.search) {
    const term = `%${escapeIlike(query.search)}%`;
    const searchClause = or(ilike(products.name, term), ilike(products.sku, term));
    if (searchClause) {
      clauses.push(searchClause);
    }
  }
  if (query.categoryId !== undefined) {
    clauses.push(eq(products.categoryId, query.categoryId));
  }
  if (query.isActive !== undefined) {
    clauses.push(eq(products.isActive, query.isActive));
  }
  if (query.lowStock) {
    clauses.push(sql`${products.stock} <= ${products.minStock}`);
  }
  return clauses.length ? and(...clauses) : undefined;
}

async function assertCategoryExists(categoryId: number) {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!category) {
    throw new AppError(404, "Categoría no encontrada");
  }
}

export async function listProducts(query: ProductListQuery) {
  const where = productFilters(query);
  const [totalRow] = await db.select({ value: count() }).from(products).where(where);
  const total = totalRow?.value ?? 0;
  const offset = (query.page - 1) * query.pageSize;
  const rows = await db
    .select()
    .from(products)
    .where(where)
    .orderBy(desc(products.id))
    .limit(query.pageSize)
    .offset(offset);

  return {
    data: rows.map(toProduct),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getProduct(id: number) {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row) {
    throw new AppError(404, "Producto no encontrado");
  }
  return toProduct(row);
}

export async function createProduct(input: CreateProductData, userId: number) {
  await assertCategoryExists(input.categoryId);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(products)
        .values({
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          categoryId: input.categoryId,
          price: input.price,
          cost: input.cost,
          stock: input.stock,
          minStock: input.minStock,
        })
        .returning();
      if (!row) {
        throw new AppError(500, "No se pudo crear el producto");
      }
      // El stock inicial también queda en el historial: el kardex arranca cuadrado.
      if (row.stock > 0) {
        await tx.insert(stockMovements).values({
          productId: row.id,
          type: "in",
          quantity: row.stock,
          previousStock: 0,
          newStock: row.stock,
          reason: "Stock inicial",
          saleId: null,
          userId,
        });
      }
      return toProduct(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "Ya existe un producto con ese SKU");
    }
    throw error;
  }
}

/**
 * Edición parcial: solo se tocan los campos presentes. Si cambia el stock, se registra
 * un movimiento `adjustment` para no perder la trazabilidad del inventario.
 */
export async function updateProduct(id: number, input: UpdateProductInput, userId: number) {
  if (input.categoryId !== undefined) {
    await assertCategoryExists(input.categoryId);
  }

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(products).where(eq(products.id, id)).for("update");
      if (!existing) {
        throw new AppError(404, "Producto no encontrado");
      }

      const [row] = await tx
        .update(products)
        .set({
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.price !== undefined ? { price: input.price } : {}),
          ...(input.cost !== undefined ? { cost: input.cost } : {}),
          ...(input.stock !== undefined ? { stock: input.stock } : {}),
          ...(input.minStock !== undefined ? { minStock: input.minStock } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();
      if (!row) {
        throw new AppError(404, "Producto no encontrado");
      }

      if (input.stock !== undefined && input.stock !== existing.stock) {
        await tx.insert(stockMovements).values({
          productId: id,
          type: "adjustment",
          quantity: Math.abs(input.stock - existing.stock),
          previousStock: existing.stock,
          newStock: input.stock,
          reason: "Edición del producto",
          saleId: null,
          userId,
        });
      }

      return toProduct(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, "Ya existe un producto con ese SKU");
    }
    throw error;
  }
}

/** Baja lógica: el producto queda inactivo (las ventas pasadas lo siguen referenciando). */
export async function deleteProduct(id: number) {
  const [row] = await db
    .update(products)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  if (!row) {
    throw new AppError(404, "Producto no encontrado");
  }
  return toProduct(row);
}
