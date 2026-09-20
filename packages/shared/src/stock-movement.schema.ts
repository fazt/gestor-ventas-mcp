/// <reference types="zod-openapi" />
import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema.js";

export const stockMovementTypeSchema = z
  .enum(["in", "out", "adjustment"])
  .meta({ id: "StockMovementType", example: "out" });

export const stockMovementSchema = z
  .object({
    id: z.number().int().meta({ example: 1 }),
    productId: z.number().int().meta({ example: 1 }),
    type: stockMovementTypeSchema,
    quantity: z.number().int().meta({ example: 2 }),
    previousStock: z.number().int().meta({ example: 25 }),
    newStock: z.number().int().meta({ example: 23 }),
    reason: z.string().nullable().meta({ example: "Venta V-000001" }),
    saleId: z.number().int().nullable().meta({ example: 1 }),
    userId: z.number().int().meta({ example: 1 }),
    createdAt: z.string().meta({ example: "2026-01-15T10:00:00.000Z" }),
  })
  .meta({
    id: "StockMovement",
    example: {
      id: 1,
      productId: 1,
      type: "out",
      quantity: 2,
      previousStock: 25,
      newStock: 23,
      reason: "Venta V-000001",
      saleId: 1,
      userId: 1,
    },
  });

export const stockMovementListQuerySchema = paginationQuerySchema
  .extend({
    productId: z.coerce.number().int().positive().optional().meta({ example: 1 }),
    type: stockMovementTypeSchema.optional(),
  })
  .meta({
    id: "StockMovementListQuery",
    example: { page: 1, pageSize: 20, productId: 1 },
  });

export const adjustStockSchema = z
  .object({
    productId: z.number().int().positive().meta({ example: 1 }),
    type: z.enum(["in", "adjustment"]).meta({ example: "in" }),
    quantity: z.number().int().positive().meta({ example: 10 }),
    reason: z.string().min(1).max(500).meta({ example: "Ingreso de mercadería" }),
  })
  .meta({
    id: "AdjustStock",
    example: {
      productId: 1,
      type: "in",
      quantity: 10,
      reason: "Ingreso de mercadería",
    },
  });

export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;
export type StockMovement = z.infer<typeof stockMovementSchema>;
export type StockMovementListQuery = z.infer<typeof stockMovementListQuerySchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
