import { db, products, saleItems, sales } from "@gestor/db";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { asMoney } from "../../lib/money.js";


function startOfLocalDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfLocalMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getSummary() {
  const todayStart = startOfLocalDay();
  const monthStart = startOfLocalMonth();

  const [today] = await db
    .select({
      count: count(),
      total: sql<string>`coalesce(sum(${sales.total})::text, '0')`,
    })
    .from(sales)
    .where(and(eq(sales.status, "completed"), gte(sales.createdAt, todayStart)));

  const [month] = await db
    .select({
      count: count(),
      total: sql<string>`coalesce(sum(${sales.total})::text, '0')`,
    })
    .from(sales)
    .where(and(eq(sales.status, "completed"), gte(sales.createdAt, monthStart)));

  const [low] = await db
    .select({ value: count() })
    .from(products)
    .where(and(eq(products.isActive, true), sql`${products.stock} <= ${products.minStock}`));

  const monthCount = month?.count ?? 0;
  const monthTotal = Number(month?.total ?? 0);
  const averageTicket = monthCount > 0 ? monthTotal / monthCount : 0;

  return {
    todayCount: today?.count ?? 0,
    todayTotal: asMoney(today?.total ?? 0),
    monthCount,
    monthTotal: asMoney(monthTotal),
    averageTicket: asMoney(averageTicket),
    lowStockCount: low?.value ?? 0,
  };
}

export async function getSalesChart(days: number) {
  const from = startOfLocalDay();
  from.setDate(from.getDate() - (days - 1));

  const rows = await db
    .select({
      date: sql<string>`to_char(date_trunc('day', ${sales.createdAt}), 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${sales.total})::text, '0')`,
      count: count(),
    })
    .from(sales)
    .where(and(eq(sales.status, "completed"), gte(sales.createdAt, from)))
    .groupBy(sql`date_trunc('day', ${sales.createdAt})`)
    .orderBy(sql`date_trunc('day', ${sales.createdAt})`);

  const byDate = new Map(rows.map((row) => [row.date, row]));
  const data: { date: string; total: string; count: number }[] = [];
  const cursor = new Date(from);

  for (let i = 0; i < days; i += 1) {
    const key = formatDateKey(cursor);
    const row = byDate.get(key);
    data.push({
      date: key,
      total: asMoney(row?.total ?? 0),
      count: row?.count ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return { data };
}

export async function getTopProducts(limit: number) {
  const rows = await db
    .select({
      productId: saleItems.productId,
      productName: saleItems.productName,
      quantitySold: sql<number>`sum(${saleItems.quantity})::int`,
      total: sql<string>`coalesce(sum(${saleItems.subtotal})::text, '0')`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(eq(sales.status, "completed"))
    .groupBy(saleItems.productId, saleItems.productName)
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
