import { db, products, saleItems, sales, stockMovements, users } from "@gestor/db";
import type {
  CreateSaleInput,
  SaleDetail,
  SaleExportQuery,
  SaleListQuery,
  UserRole,
} from "@gestor/shared";
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { CSV_BOM, csvRow } from "../../lib/csv.js";
import { env } from "../../lib/env.js";
import { AppError } from "../../lib/errors.js";
import { fromCents, toCents } from "../../lib/money.js";
import { toSale, toSaleItem } from "../../lib/serialize.js";
import { localDateOf, localDayEnd, localDayStart, localToday, tzLiteral } from "../../lib/time.js";
import { escapeIlike } from "../products/products.service.js";

/** Lock transaccional que serializa la numeración `V-000001` entre ventas concurrentes. */
const SALE_CODE_LOCK = 871234;
const EXPORT_MAX_ROWS = 50_000;

export type SaleActor = { id: number; role: UserRole };

function mergeItems(items: CreateSaleInput["items"]): { productId: number; quantity: number }[] {
  const map = new Map<number, number>();
  for (const item of items) {
    map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
  }
  // Orden por id: todas las transacciones bloquean filas en el mismo orden (sin deadlocks).
  return [...map.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId - b.productId);
}

/** Impuesto configurado (STORE_TAX_RATE %) sobre la base imponible, redondeado al centavo. */
export function computeTaxCents(taxableCents: number, ratePercent: number = env.STORE_TAX_RATE): number {
  if (ratePercent <= 0 || taxableCents <= 0) return 0;
  return Math.round((taxableCents * ratePercent) / 100);
}

export function nextSaleCode(lastCode: string | undefined): string {
  const n = lastCode ? Number(lastCode.replace(/^V-/, "")) + 1 : 1;
  if (!Number.isFinite(n) || n < 1) {
    return "V-000001";
  }
  return `V-${String(n).padStart(6, "0")}`;
}

function saleFilters(query: Omit<SaleListQuery, "page" | "pageSize">): SQL | undefined {
  const clauses: SQL[] = [];
  if (query.status) {
    clauses.push(eq(sales.status, query.status));
  }
  if (query.paymentMethod) {
    clauses.push(eq(sales.paymentMethod, query.paymentMethod));
  }
  if (query.userId !== undefined) {
    clauses.push(eq(sales.userId, query.userId));
  }
  if (query.from) {
    clauses.push(gte(sales.createdAt, localDayStart(query.from)));
  }
  if (query.to) {
    clauses.push(lt(sales.createdAt, localDayEnd(query.to)));
  }
  if (query.from && query.to && query.from > query.to) {
    throw new AppError(400, "La fecha inicial no puede ser posterior a la final");
  }
  if (query.search) {
    const term = `%${escapeIlike(query.search)}%`;
    const clause = or(
      ilike(sales.code, term),
      ilike(sales.customerName, term),
      ilike(sales.customerDocument, term),
    );
    if (clause) clauses.push(clause);
  }
  return clauses.length ? and(...clauses) : undefined;
}

export async function listSales(query: SaleListQuery) {
  const where = saleFilters(query);
  const [totalRow] = await db.select({ value: count() }).from(sales).where(where);
  const total = totalRow?.value ?? 0;
  const offset = (query.page - 1) * query.pageSize;
  const rows = await db
    .select({ sale: sales, sellerName: users.name })
    .from(sales)
    .leftJoin(users, eq(users.id, sales.userId))
    .where(where)
    .orderBy(desc(sales.createdAt), desc(sales.id))
    .limit(query.pageSize)
    .offset(offset);

  return {
    data: rows.map((row) => toSale(row.sale, row.sellerName)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getSale(id: number): Promise<SaleDetail> {
  const [row] = await db
    .select({ sale: sales, sellerName: users.name })
    .from(sales)
    .leftJoin(users, eq(users.id, sales.userId))
    .where(eq(sales.id, id))
    .limit(1);
  if (!row) {
    throw new AppError(404, "Venta no encontrada");
  }
  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, id)).orderBy(asc(saleItems.id));
  return {
    ...toSale(row.sale, row.sellerName),
    items: items.map(toSaleItem),
  };
}

export async function createSale(userId: number, input: CreateSaleInput): Promise<SaleDetail> {
  const merged = mergeItems(input.items);
  const productIds = merged.map((item) => item.productId);

  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SALE_CODE_LOCK})`);

    const locked = await tx
      .select()
      .from(products)
      .where(inArray(products.id, productIds))
      .orderBy(asc(products.id))
      .for("update");

    const byId = new Map(locked.map((row) => [row.id, row]));
    const shortages: { productId: number; sku: string; name: string; requested: number; available: number }[] = [];

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

    let subtotalCents = 0;
    const prepared = merged.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new AppError(404, `Producto ${item.productId} no encontrado`);
      }
      const unitCents = toCents(product.price);
      const lineCents = unitCents * item.quantity;
      subtotalCents += lineCents;
      return { product, quantity: item.quantity, unitCents, lineCents };
    });

    const discountCents = input.discount ? toCents(input.discount) : 0;
    if (discountCents > subtotalCents) {
      throw new AppError(400, "El descuento no puede superar el subtotal");
    }
    const taxCents =
      input.tax !== undefined ? toCents(input.tax) : computeTaxCents(subtotalCents - discountCents);
    const totalCents = subtotalCents - discountCents + taxCents;

    // El seed usa códigos `V-DEMO-NNN` fuera de la secuencia: se toma el mayor `V-<número>`.
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
        customerName: input.customerName || null,
        customerDocument: input.customerDocument || null,
        subtotal: fromCents(subtotalCents),
        discount: fromCents(discountCents),
        tax: fromCents(taxCents),
        total: fromCents(totalCents),
        paymentMethod: input.paymentMethod,
        status: "completed",
      })
      .returning();

    if (!sale) {
      throw new AppError(500, "No se pudo registrar la venta");
    }

    await tx.insert(saleItems).values(
      prepared.map((line) => ({
        saleId: sale.id,
        productId: line.product.id,
        productName: line.product.name,
        quantity: line.quantity,
        unitPrice: fromCents(line.unitCents),
        unitCost: line.product.cost,
        subtotal: fromCents(line.lineCents),
      })),
    );

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

    return sale.id;
  });

  return getSale(created);
}

/**
 * Cancela una venta y devuelve el stock. Reglas:
 * - admin: cualquier venta.
 * - vendedor: solo las suyas y del mismo día (zona horaria de la tienda).
 */
export async function cancelSale(id: number, actor: SaleActor, reason?: string): Promise<SaleDetail> {
  await db.transaction(async (tx) => {
    const [sale] = await tx
      .select({
        row: sales,
        sameDay: sql<boolean>`${localDateOf(sales.createdAt)} = ${localToday()}`,
      })
      .from(sales)
      .where(eq(sales.id, id))
      .for("update");
    if (!sale) {
      throw new AppError(404, "Venta no encontrada");
    }
    if (actor.role !== "admin") {
      if (sale.row.userId !== actor.id) {
        throw new AppError(403, "Solo puedes cancelar tus propias ventas");
      }
      if (!sale.sameDay) {
        throw new AppError(403, "Las ventas de días anteriores solo las cancela un administrador");
      }
    }
    if (sale.row.status === "cancelled") {
      throw new AppError(409, "La venta ya está cancelada");
    }

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id));
    const quantities = new Map<number, number>();
    for (const item of items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    const productIds = [...quantities.keys()].sort((a, b) => a - b);
    const lockedProducts = productIds.length
      ? await tx.select().from(products).where(inArray(products.id, productIds)).orderBy(asc(products.id)).for("update")
      : [];

    for (const product of lockedProducts) {
      const quantity = quantities.get(product.id) ?? 0;
      const previousStock = product.stock;
      const newStock = previousStock + quantity;
      await tx.update(products).set({ stock: newStock, updatedAt: new Date() }).where(eq(products.id, product.id));
      await tx.insert(stockMovements).values({
        productId: product.id,
        type: "in",
        quantity,
        previousStock,
        newStock,
        reason: `Cancelación ${sale.row.code}`,
        saleId: sale.row.id,
        userId: actor.id,
      });
    }

    await tx
      .update(sales)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: actor.id,
        cancelReason: reason ?? null,
      })
      .where(eq(sales.id, id));
  });

  return getSale(id);
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  yape: "Yape",
};

/** CSV de ventas con los mismos filtros del listado (máx. 50 000 filas). */
export async function exportSalesCsv(query: SaleExportQuery): Promise<string> {
  const where = saleFilters(query);
  const rows = await db
    .select({
      sale: sales,
      sellerName: users.name,
      localDate: sql<string>`to_char(${sales.createdAt} AT TIME ZONE ${tzLiteral()}, 'YYYY-MM-DD HH24:MI')`,
      itemsCount: sql<number>`(SELECT coalesce(sum(${saleItems.quantity}), 0)::int FROM ${saleItems} WHERE ${saleItems.saleId} = ${sales.id})`,
    })
    .from(sales)
    .leftJoin(users, eq(users.id, sales.userId))
    .where(where)
    .orderBy(desc(sales.createdAt))
    .limit(EXPORT_MAX_ROWS);

  const header = csvRow([
    "Código",
    "Fecha",
    "Vendedor",
    "Cliente",
    "Documento",
    "Unidades",
    "Subtotal",
    "Descuento",
    "Impuesto",
    "Total",
    "Pago",
    "Estado",
    "Motivo de cancelación",
  ]);
  const lines = rows.map(({ sale, sellerName, localDate, itemsCount }) =>
    csvRow([
      sale.code,
      localDate,
      sellerName ?? "",
      sale.customerName ?? "",
      sale.customerDocument ?? "",
      itemsCount,
      sale.subtotal,
      sale.discount,
      sale.tax,
      sale.total,
      PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod,
      sale.status === "completed" ? "Completada" : "Cancelada",
      sale.cancelReason ?? "",
    ]),
  );
  return `${CSV_BOM}${[header, ...lines].join("\r\n")}\r\n`;
}
