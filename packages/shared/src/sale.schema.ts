/// <reference types="zod-openapi" />
import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema.js";
import { moneySchema } from "./product.schema.js";

export const paymentMethodSchema = z
  .enum(["cash", "card", "transfer", "yape"])
  .meta({ id: "PaymentMethod", example: "cash" });

export const saleStatusSchema = z
  .enum(["completed", "cancelled"])
  .meta({ id: "SaleStatus", example: "completed" });

export const saleItemInputSchema = z
  .object({
    productId: z.number().int().positive().meta({ example: 1 }),
    quantity: z.number().int().positive().max(10_000).meta({ example: 2 }),
  })
  .meta({
    id: "SaleItemInput",
    example: { productId: 1, quantity: 2 },
  });

export const createSaleSchema = z
  .object({
    customerName: z.string().trim().max(255).optional().meta({ example: "Ana Pérez" }),
    customerDocument: z.string().trim().max(64).optional().meta({ example: "12345678" }),
    discount: moneySchema.optional().meta({ example: "5.00" }),
    tax: moneySchema.optional().meta({ example: "0.00" }),
    paymentMethod: paymentMethodSchema,
    items: z.array(saleItemInputSchema).min(1).max(100),
  })
  .meta({
    id: "CreateSale",
    example: {
      customerName: "Ana Pérez",
      paymentMethod: "cash",
      items: [{ productId: 1, quantity: 2 }],
    },
  });

export const saleItemSchema = z
  .object({
    id: z.number().int().meta({ example: 1 }),
    saleId: z.number().int().meta({ example: 1 }),
    productId: z.number().int().meta({ example: 1 }),
    productName: z.string().meta({ example: "Teclado mecánico" }),
    quantity: z.number().int().meta({ example: 2 }),
    unitPrice: moneySchema,
    subtotal: moneySchema,
  })
  .meta({
    id: "SaleItem",
    example: {
      id: 1,
      saleId: 1,
      productId: 1,
      productName: "Teclado mecánico",
      quantity: 2,
      unitPrice: "129.90",
      subtotal: "259.80",
    },
  });

export const saleSchema = z
  .object({
    id: z.number().int().meta({ example: 1 }),
    code: z.string().meta({ example: "V-000001" }),
    userId: z.number().int().meta({ example: 1 }),
    sellerName: z.string().nullable().meta({ example: "Lucía Vendedora" }),
    customerName: z.string().nullable().meta({ example: "Ana Pérez" }),
    customerDocument: z.string().nullable().meta({ example: "12345678" }),
    subtotal: moneySchema,
    discount: moneySchema,
    tax: moneySchema,
    total: moneySchema,
    paymentMethod: paymentMethodSchema,
    status: saleStatusSchema,
    cancelledAt: z.string().nullable().meta({ example: null }),
    cancelledBy: z.number().int().nullable().meta({ example: null }),
    cancelReason: z.string().nullable().meta({ example: null }),
    createdAt: z.string().meta({ example: "2026-01-15T10:00:00.000Z" }),
  })
  .meta({
    id: "Sale",
    example: {
      id: 1,
      code: "V-000001",
      userId: 1,
      total: "254.80",
      paymentMethod: "cash",
      status: "completed",
    },
  });

export const saleDetailSchema = saleSchema
  .extend({
    items: z.array(saleItemSchema),
  })
  .meta({ id: "SaleDetail" });

/** Fecha de calendario (YYYY-MM-DD) que se interpreta en la zona horaria de la tienda. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato YYYY-MM-DD")
  .meta({ example: "2026-01-31" });

export const saleListQuerySchema = paginationQuerySchema
  .extend({
    status: saleStatusSchema.optional(),
    from: dateOnlySchema.optional().meta({ example: "2026-01-01" }),
    to: dateOnlySchema.optional().meta({ example: "2026-01-31" }),
    search: z.string().trim().max(100).optional().meta({ example: "V-000012" }),
    paymentMethod: paymentMethodSchema.optional(),
    userId: z.coerce.number().int().positive().optional().meta({ example: 2 }),
  })
  .meta({
    id: "SaleListQuery",
    example: { page: 1, pageSize: 20, status: "completed" },
  });

export const saleExportQuerySchema = saleListQuerySchema
  .omit({ page: true, pageSize: true })
  .meta({ id: "SaleExportQuery" });

export const cancelSaleSchema = z
  .object({
    reason: z.string().trim().min(3).max(500).optional().meta({ example: "Cliente desistió" }),
  })
  .meta({ id: "CancelSale", example: { reason: "Cliente desistió" } });

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type SaleStatus = z.infer<typeof saleStatusSchema>;
export type SaleItemInput = z.infer<typeof saleItemInputSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type SaleItem = z.infer<typeof saleItemSchema>;
export type Sale = z.infer<typeof saleSchema>;
export type SaleDetail = z.infer<typeof saleDetailSchema>;
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;
export type SaleListParams = z.input<typeof saleListQuerySchema>;
export type SaleExportQuery = z.infer<typeof saleExportQuerySchema>;
export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;
