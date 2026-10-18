import { categories, db, products, saleItems, sales, users } from "@gestor/db";
import { and, count, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { env } from "../../lib/env.js";
import { AppError } from "../../lib/errors.js";
import { asMoney } from "../../lib/money.js";
import { localDateOf, localDayEnd, localDayStart, localToday, startOfMonth, startOfToday, tzLiteral } from "../../lib/time.js";

const completed = eq(sales.status, "completed");

async function totalsSince(since: SQL) {
  const [row] = await db
    .select({
      count: count(),
      total: sql<string>`coalesce(sum(${sales.total}), 0)::text`,
    })
    .from(sales)
    .where(and(completed, gte(sales.createdAt, since)));
  return { count: row?.count ?? 0, total: row?.total ?? "0" };
}

export async function getSummary() {
  const [today, month, low, marginRow] = await Promise.all([
    totalsSince(startOfToday()),
    totalsSince(startOfMonth()),
    db
      .select({ value: count() })
      .from(products)
      .where(and(eq(products.isActive, true), sql`${products.stock} <= ${products.minStock}`)),
    db
      .select({
        revenue: sql<string>`coalesce(sum(${saleItems.subtotal}), 0)::text`,
        cost: sql<string>`coalesce(sum(${saleItems.unitCost} * ${saleItems.quantity}), 0)::text`,
      })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(and(completed, gte(sales.createdAt, startOfMonth()))),
  ]);

  const monthTotal = Number(month.total);
  const averageTicket = month.count > 0 ? monthTotal / month.count : 0;
  const revenue = Number(marginRow[0]?.revenue ?? 0);
  const cost = Number(marginRow[0]?.cost ?? 0);

  return {
    todayCount: today.count,
    todayTotal: asMoney(today.total),
    monthCount: month.count,
    monthTotal: asMoney(month.total),
    averageTicket: asMoney(averageTicket),
    monthGrossMargin: asMoney(revenue - cost),
    monthMarginPercent: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0,
    lowStockCount: low[0]?.value ?? 0,
    currency: env.STORE_CURRENCY,
    timezone: env.STORE_TIMEZONE,
  };
}

/** Serie diaria de los últimos `days` días (incluye días sin ventas en 0). */
export async function getSalesChart(days: number) {
  const day = localDateOf(sales.createdAt);
  const result = await db.execute<{ date: string; total: string; count: number }>(sql`
    WITH days AS (
      SELECT generate_series(${localToday()} - ${days - 1}::int, ${localToday()}, interval '1 day')::date AS day
    ),
    totals AS (
      SELECT ${day} AS day, sum(${sales.total}) AS total, count(*)::int AS count
      FROM ${sales}
      WHERE ${sales.status} = 'completed'
        AND ${sales.createdAt} >= (((${localToday()} - ${days - 1}::int))::timestamp AT TIME ZONE ${tzLiteral()})
      GROUP BY 1
    )
    SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
           coalesce(totals.total, 0)::text AS total,
           coalesce(totals.count, 0)::int AS count
    FROM days LEFT JOIN totals ON totals.day = days.day
    ORDER BY days.day
  `);

  return {
    data: result.rows.map((row) => ({
      date: row.date,
      total: asMoney(row.total),
      count: Number(row.count),
    })),
  };
}

export async function getTopProducts(limit: number, days?: number) {
  const where = days
    ? and(completed, gte(sales.createdAt, sql`${startOfToday()} - make_interval(days => ${days - 1})`))
    : completed;
  const rows = await db
    .select({
      productId: saleItems.productId,
      productName: products.name,
      quantitySold: sql<number>`sum(${saleItems.quantity})::int`,
      total: sql<string>`coalesce(sum(${saleItems.subtotal}), 0)::text`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .where(where)
    .groupBy(saleItems.productId, products.name)
    .orderBy(desc(sql`sum(${saleItems.quantity})`))
    .limit(limit);

  return {
    data: rows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      quantitySold: Number(row.quantitySold),
      total: asMoney(row.total),
    })),
  };
}

/**
 * Reporte por rango (fechas locales inclusive): totales, margen bruto y desglose por
 * método de pago, vendedor y categoría. Solo ventas completadas.
 */
export async function getReport(from: string, to: string) {
  if (from > to) {
    throw new AppError(400, "La fecha inicial no puede ser posterior a la final");
  }
  const range = and(completed, gte(sales.createdAt, localDayStart(from)), lt(sales.createdAt, localDayEnd(to)));

  const [totals] = await db
    .select({
      count: count(),
      subtotal: sql<string>`coalesce(sum(${sales.subtotal}), 0)::text`,
      discount: sql<string>`coalesce(sum(${sales.discount}), 0)::text`,
      tax: sql<string>`coalesce(sum(${sales.tax}), 0)::text`,
      total: sql<string>`coalesce(sum(${sales.total}), 0)::text`,
    })
    .from(sales)
    .where(range);

  const [costRow] = await db
    .select({ cost: sql<string>`coalesce(sum(${saleItems.unitCost} * ${saleItems.quantity}), 0)::text` })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(range);

  const [cancelled] = await db
    .select({ count: count(), total: sql<string>`coalesce(sum(${sales.total}), 0)::text` })
    .from(sales)
    .where(
      and(
        eq(sales.status, "cancelled"),
        gte(sales.createdAt, localDayStart(from)),
        lt(sales.createdAt, localDayEnd(to)),
      ),
    );

  const byPaymentMethod = await db
    .select({
      paymentMethod: sales.paymentMethod,
      count: count(),
      total: sql<string>`coalesce(sum(${sales.total}), 0)::text`,
    })
    .from(sales)
    .where(range)
    .groupBy(sales.paymentMethod)
    .orderBy(desc(sql`sum(${sales.total})`));

  const bySeller = await db
    .select({
      userId: sales.userId,
      userName: users.name,
      count: count(),
      total: sql<string>`coalesce(sum(${sales.total}), 0)::text`,
    })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.userId))
    .where(range)
    .groupBy(sales.userId, users.name)
    .orderBy(desc(sql`sum(${sales.total})`));

  const byCategory = await db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      quantity: sql<number>`sum(${saleItems.quantity})::int`,
      total: sql<string>`coalesce(sum(${saleItems.subtotal}), 0)::text`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(products, eq(products.id, saleItems.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(range)
    .groupBy(categories.id, categories.name)
    .orderBy(desc(sql`sum(${saleItems.subtotal})`));

  // Margen sobre el neto de líneas (antes de descuento global e impuestos).
  const lineRevenue = Number(totals?.subtotal ?? 0);
  const cost = Number(costRow?.cost ?? 0);

  return {
    from,
    to,
    currency: env.STORE_CURRENCY,
    totals: {
      count: totals?.count ?? 0,
      subtotal: asMoney(totals?.subtotal),
      discount: asMoney(totals?.discount),
      tax: asMoney(totals?.tax),
      total: asMoney(totals?.total),
      cost: asMoney(cost),
      grossMargin: asMoney(lineRevenue - cost),
      averageTicket: asMoney((totals?.count ?? 0) > 0 ? Number(totals?.total ?? 0) / (totals?.count ?? 1) : 0),
    },
    cancelled: { count: cancelled?.count ?? 0, total: asMoney(cancelled?.total) },
    byPaymentMethod: byPaymentMethod.map((row) => ({ ...row, total: asMoney(row.total) })),
    bySeller: bySeller.map((row) => ({ ...row, total: asMoney(row.total) })),
    byCategory: byCategory.map((row) => ({ ...row, quantity: Number(row.quantity), total: asMoney(row.total) })),
  };
}

/** Configuración pública de la tienda que el panel necesita (moneda, impuesto, zona). */
export function getStoreSettings() {
  return {
    name: env.STORE_NAME,
    currency: env.STORE_CURRENCY,
    timezone: env.STORE_TIMEZONE,
    taxRate: env.STORE_TAX_RATE,
    taxName: env.STORE_TAX_NAME,
  };
}
