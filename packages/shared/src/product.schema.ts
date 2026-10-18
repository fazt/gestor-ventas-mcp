/// <reference types="zod-openapi" />
import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema.js";

export const moneySchema = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Monto inválido (usa 129.90)")
  .meta({ example: "129.90" });

/** Booleano en query string: `z.coerce.boolean()` convierte "false" en `true`. */
export const queryBooleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const productSchema = z
  .object({
    id: z.number().int().meta({ example: 1 }),
    sku: z.string().meta({ example: "SKU-001" }),
    name: z.string().meta({ example: "Teclado mecánico" }),
    description: z.string().nullable().meta({ example: "Teclado mecánico RGB" }),
    categoryId: z.number().int().meta({ example: 1 }),
    price: moneySchema,
    cost: moneySchema,
    stock: z.number().int().meta({ example: 25 }),
    minStock: z.number().int().meta({ example: 5 }),
    isActive: z.boolean().meta({ example: true }),
    createdAt: z.string().meta({ example: "2026-01-15T10:00:00.000Z" }),
    updatedAt: z.string().meta({ example: "2026-01-15T10:00:00.000Z" }),
  })
  .meta({
    id: "Product",
    example: {
      id: 1,
      sku: "SKU-001",
      name: "Teclado mecánico",
      price: "129.90",
      stock: 25,
    },
  });

export const createProductSchema = z
  .object({
    sku: z.string().trim().min(1).max(64).meta({ example: "SKU-001" }),
    name: z.string().trim().min(1).max(255).meta({ example: "Teclado mecánico" }),
    description: z.string().max(2000).optional().meta({ example: "Teclado mecánico RGB" }),
    categoryId: z.number().int().positive().meta({ example: 1 }),
    price: moneySchema,
    cost: moneySchema,
    stock: z.number().int().min(0).default(0).meta({ example: 25 }),
    minStock: z.number().int().min(0).default(0).meta({ example: 5 }),
  })
  .meta({
    id: "CreateProduct",
    example: {
      sku: "SKU-001",
      name: "Teclado mecánico",
      categoryId: 1,
      price: "129.90",
      cost: "75.00",
      stock: 25,
      minStock: 5,
    },
  });

/**
 * Edición parcial. Se define sin `.default()`: en Zod 4 los defaults se aplican también
 * dentro de `.partial()`, así que editar solo el precio reseteaba stock y mínimo a 0.
 * Si llega `stock` distinto del actual, la API lo registra como movimiento de ajuste.
 */
export const updateProductSchema = z
  .object({
    sku: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(2000).nullable().optional(),
    categoryId: z.number().int().positive().optional(),
    price: moneySchema.optional(),
    cost: moneySchema.optional(),
    stock: z.number().int().min(0).optional(),
    minStock: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .meta({
    id: "UpdateProduct",
    example: { price: "139.90" },
  });

export const productListQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().max(100).optional().meta({ example: "teclado" }),
    categoryId: z.coerce.number().int().positive().optional().meta({ example: 1 }),
    isActive: queryBooleanSchema.optional().meta({ example: "true" }),
    lowStock: queryBooleanSchema.optional().meta({ example: "true" }),
  })
  .meta({
    id: "ProductListQuery",
    example: { page: 1, pageSize: 20, search: "teclado", categoryId: 1 },
  });

export type Product = z.infer<typeof productSchema>;
export type CreateProductInput = z.input<typeof createProductSchema>;
export type CreateProductData = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
/** Lo que envía el cliente (los booleanos de la query viajan como texto). */
export type ProductListParams = z.input<typeof productListQuerySchema>;
