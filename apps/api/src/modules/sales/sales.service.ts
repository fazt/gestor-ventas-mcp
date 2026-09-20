import { db, products, saleItems, sales, stockMovements } from "@gestor/db";
import type { CreateSaleInput, SaleDetail, SaleListQuery } from "@gestor/shared";
import { and, count, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { AppError } from "../../lib/errors.js";
import { asMoney, parseMoney } from "../../lib/money.js";
import { toSale, toSaleItem } from "../../lib/serialize.js";

function mergeItems(items: CreateSaleInput["items"]): { productId: number; quantity: number }[] {
  const map = new Map<number, number>();
  for (const item of items) {
    map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
  }
  return [...map.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId - b.productId);
}

function nextSaleCode(lastCode: string | undefined): string {
  const n = lastCode ? Number(lastCode.replace(/^V-/, "")) + 1 : 1;
  if (!Number.isFinite(n) || n < 1) {
    return "V-000001";
  }
  return `V-${String(n).padStart(6, "0")}`;
}

function saleFilters(query: SaleListQuery): SQL | undefined {
  const clauses: SQL[] = [];
  if (query.status) {
    clauses.push(eq(sales.status, query.status));
  }
  if (query.from) {
    const from = new Date(`${query.from}T00:00:00.000`);
    if (Number.isNaN(from.getTime())) {
      throw new AppError(400, "Fecha `from` inválida");
    }
    clauses.push(gte(sales.createdAt, from));
  }
  if (query.to) {
    const to = new Date(`${query.to}T23:59:59.999`);
    if (Number.isNaN(to.getTime())) {
      throw new AppError(400, "Fecha `to` inválida");
    }
    clauses.push(lte(sales.createdAt, to));
  }
  return clauses.length ? and(...clauses) : undefined;
}

export async function listSales(query: SaleListQuery) {
  const where = saleFilters(query);
  const [totalRow] = await db.select({ value: count() }).from(sales).where(where);
  const total = totalRow?.value ?? 0;
  const offset = (query.page - 1) * query.pageSize;
  const rows = await db
    .select()
    .from(sales)
    .where(where)
    .orderBy(desc(sales.id))
    .limit(query.pageSize)
    .offset(offset);

  return {
    data: rows.map(toSale),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getSale(id: number): Promise<SaleDetail> {
  const [sale] = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
  if (!sale) {
    throw new AppError(404, "Venta no encontrada");
  }
  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, id));
  return {
    ...toSale(sale),
    items: items.map(toSaleItem),
  };
}

export async function createSale(userId: number, input: CreateSaleInput): Promise<SaleDetail> {
  const merged = mergeItems(input.items);
  const productIds = merged.map((item) => item.productId);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(871234)`);

    const locked = await tx
      .select()
      .from(products)
      .where(inArray(products.id, productIds))
      .for("update");

    const byId = new Map(locked.map((row) => [row.id, row]));
    const shortages: { productId: number; sku?: string; name?: string; requested: number; available: number }[] =
      [];

    for (const item of merged) {
      const product = byId.get(item.productId);
      if (!product || !product.isActive) {
        throw new AppError(404, `Producto ${item.productId} no encontrado o inactivo`);
      }
      if (product.stock < item.quantity) {
        shortages.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          requested: item.quantity,
          available: product.stock,
        });
      }
    }

    if (shortages.length > 0) {
      throw new AppError(409, "Stock insuficiente", { shortages });
    }

    let subtotal = 0;
    const prepared = merged.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new AppError(404, `Producto ${item.productId} no encontrado`);
      }
      const unitPrice = Number(product.price);
      const line = unitPrice * item.quantity;
      subtotal += line;
      return {
        product,
        quantity: item.quantity,
        unitPrice,
        lineSubtotal: line,
      };
    });

    const discount = parseMoney(input.discount);
    const tax = parseMoney(input.tax);
    if (discount < 0 || tax < 0) {
      throw new AppError(400, "Descuento e impuesto deben ser mayores o iguales a 0");
    }
    if (discount > subtotal) {
      throw new AppError(400, "El descuento no puede superar el subtotal");
    }
    const total = subtotal - discount + tax;
    if (total < 0) {
      throw new AppError(400, "El total de la venta no puede ser negativo");
    }

    // El seed inserta codigos `V-DEMO-NN`, que no son parte de la secuencia:
    // hay que quedarse con el mayor `V-<numero>` y no con la ultima fila por id.
    const [last] = await tx
      .select({ code: sales.code })
      .from(sales)
      .where(sql`${sales.code} ~ '^V-[0-9]+$'`)
      .orderBy(sql`CAST(SUBSTRING(${sales.code} FROM 3) AS BIGINT) DESC`)
      .limit(1);
    const code = nextSaleCode(last?.code);

    const [sale] = await tx
      .insert(sales)
      .values({
        code,
        userId,
        customerName: input.customerName ?? null,
        customerDocument: input.customerDocument ?? null,
        subtotal: asMoney(subtotal),
        discount: asMoney(discount),
        tax: asMoney(tax),
        total: asMoney(total),
        paymentMethod: input.paymentMethod,
        status: "completed",
      })
      .returning();

    if (!sale) {
      throw new AppError(500, "No se pudo registrar la venta");
    }

    const insertedItems = await tx
      .insert(saleItems)
      .values(
        prepared.map((line) => ({
          saleId: sale.id,
          productId: line.product.id,
          productName: line.product.name,
          quantity: line.quantity,
          unitPrice: asMoney(line.unitPrice),
          subtotal: asMoney(line.lineSubtotal),
        })),
      )
      .returning();

    for (const line of prepared) {
      const previousStock = line.product.stock;
      const newStock = previousStock - line.quantity;
      await tx
        .update(products)
        .set({ stock: newStock, updatedAt: new Date() })
        .where(eq(products.id, line.product.id));
      await tx.insert(stockMovements).values({
        productId: line.product.id,
        type: "out",
        quantity: line.quantity,
        previousStock,
        newStock,
        reason: `Venta ${sale.code}`,
        saleId: sale.id,
        userId,
      });
    }

    return {
      ...toSale(sale),
      items: insertedItems.map(toSaleItem),
    };
  });
}

export async function cancelSale(id: number, userId: number): Promise<SaleDetail> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(871234)`);

    const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for("update");
    if (!sale) {
      throw new AppError(404, "Venta no encontrada");
    }
    if (sale.status === "cancelled") {
      throw new AppError(409, "La venta ya está cancelada");
    }

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id));
    const productIds = [...new Set(items.map((item) => item.productId))].sort((a, b) => a - b);
    if (productIds.length > 0) {
      await tx.select().from(products).where(inArray(products.id, productIds)).for("update");
    }

    for (const item of items) {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);
      if (!product) {
        throw new AppError(404, `Producto ${item.productId} no encontrado`);
      }
      const previousStock = product.stock;
      const newStock = previousStock + item.quantity;
      await tx
        .update(products)
        .set({ stock: newStock, updatedAt: new Date() })
        .where(eq(products.id, product.id));
      await tx.insert(stockMovements).values({
        productId: product.id,
        type: "in",
        quantity: item.quantity,
        previousStock,
        newStock,
        reason: `Cancelación ${sale.code}`,
        saleId: sale.id,
        userId,
      });
    }

    const [updated] = await tx
      .update(sales)
      .set({ status: "cancelled" })
      .where(eq(sales.id, id))
      .returning();

    if (!updated) {
      throw new AppError(500, "No se pudo cancelar la venta");
    }

    return {
      ...toSale(updated),
      items: items.map(toSaleItem),
    };
  });
}
