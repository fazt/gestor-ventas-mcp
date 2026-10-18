import { db, products, stockMovements, users } from "@gestor/db";
import type { AdjustStockInput, StockMovementListQuery } from "@gestor/shared";
import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { AppError } from "../../lib/errors.js";
import { toProduct, toStockMovement } from "../../lib/serialize.js";

function movementFilters(query: StockMovementListQuery): SQL | undefined {
  const clauses: SQL[] = [];
  if (query.productId !== undefined) {
    clauses.push(eq(stockMovements.productId, query.productId));
  }
  if (query.type) {
    clauses.push(eq(stockMovements.type, query.type));
  }
  return clauses.length ? and(...clauses) : undefined;
}

export async function listMovements(query: StockMovementListQuery) {
  const where = movementFilters(query);
  const [totalRow] = await db.select({ value: count() }).from(stockMovements).where(where);
  const total = totalRow?.value ?? 0;
  const offset = (query.page - 1) * query.pageSize;
  const rows = await db
    .select({
      movement: stockMovements,
      productName: products.name,
      productSku: products.sku,
      userName: users.name,
    })
    .from(stockMovements)
    .leftJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(users, eq(users.id, stockMovements.userId))
    .where(where)
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(query.pageSize)
    .offset(offset);

  return {
    data: rows.map((row) =>
      toStockMovement(row.movement, {
        productName: row.productName,
        productSku: row.productSku,
        userName: row.userName,
      }),
    ),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function listLowStock(limit = 200) {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), sql`${products.stock} <= ${products.minStock}`))
    .orderBy(asc(products.stock), asc(products.name))
    .limit(limit);
  return { data: rows.map(toProduct) };
}

/**
 * Movimiento manual de inventario:
 * - `in`: suma `quantity` (ingreso de mercadería).
 * - `out`: resta `quantity` (merma, rotura, devolución a proveedor).
 * - `adjustment`: fija el stock a `quantity` (conteo físico); guarda la diferencia.
 */
export async function adjustStock(userId: number, input: AdjustStockInput) {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update");

    if (!product) {
      throw new AppError(404, "Producto no encontrado");
    }

    const previousStock = product.stock;
    let newStock: number;
    let quantity: number;

    if (input.type === "in") {
      newStock = previousStock + input.quantity;
      quantity = input.quantity;
    } else if (input.type === "out") {
      newStock = previousStock - input.quantity;
      quantity = input.quantity;
    } else {
      newStock = input.quantity;
      quantity = Math.abs(newStock - previousStock);
      if (quantity === 0) {
        throw new AppError(400, "El ajuste no cambia el stock actual");
      }
    }

    if (newStock < 0) {
      throw new AppError(400, `El stock no puede quedar negativo (disponible: ${previousStock})`);
    }

    const [updated] = await tx
      .update(products)
      .set({ stock: newStock, updatedAt: new Date() })
      .where(eq(products.id, product.id))
      .returning();

    if (!updated) {
      throw new AppError(500, "No se pudo ajustar el stock");
    }

    const [movement] = await tx
      .insert(stockMovements)
      .values({
        productId: product.id,
        type: input.type,
        quantity,
        previousStock,
        newStock,
        reason: input.reason,
        saleId: null,
        userId,
      })
      .returning();

    if (!movement) {
      throw new AppError(500, "No se pudo registrar el movimiento");
    }

    return {
      product: toProduct(updated),
      movement: toStockMovement(movement, { productName: updated.name, productSku: updated.sku }),
    };
  });
}
