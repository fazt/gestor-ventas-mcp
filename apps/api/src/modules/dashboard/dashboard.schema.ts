/// <reference types="zod-openapi" />
import { moneySchema } from "@gestor/shared";
import { z } from "zod";

export const dashboardSummarySchema = z
  .object({
    todayCount: z.number().int().meta({ example: 4 }),
    todayTotal: moneySchema,
    monthCount: z.number().int().meta({ example: 42 }),
    monthTotal: moneySchema,
    averageTicket: moneySchema,
    lowStockCount: z.number().int().meta({ example: 2 }),
  })
  .meta({
    id: "DashboardSummary",
    example: {
      todayCount: 4,
      todayTotal: "519.60",
      monthCount: 42,
      monthTotal: "8120.50",
      averageTicket: "193.35",
      lowStockCount: 2,
    },
  });

export const salesChartQuerySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(365).default(30).meta({ example: 30 }),
  })
  .meta({ id: "SalesChartQuery" });

export const salesChartPointSchema = z
  .object({
    date: z.string().meta({ example: "2026-01-15" }),
    total: moneySchema,
    count: z.number().int().meta({ example: 3 }),
  })
  .meta({ id: "SalesChartPoint" });

export const salesChartSchema = z
  .object({
    data: z.array(salesChartPointSchema),
  })
  .meta({ id: "SalesChart" });

export const topProductsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(10).meta({ example: 10 }),
  })
  .meta({ id: "TopProductsQuery" });

export const topProductSchema = z
  .object({
    productId: z.number().int().meta({ example: 1 }),
    productName: z.string().meta({ example: "Teclado mecanico" }),
    quantitySold: z.number().int().meta({ example: 12 }),
    total: moneySchema,
  })
  .meta({ id: "TopProduct" });

export const topProductsSchema = z
  .object({
    data: z.array(topProductSchema),
  })
  .meta({ id: "TopProducts" });
