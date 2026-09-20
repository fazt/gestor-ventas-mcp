/// <reference types="zod-openapi" />
import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema.js";

export const moneySchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .meta({ example: "129.90" });

export const productSchema = z
  .object({
    id: z.number().int().meta({ example: 1 }),
    sku: z.string().meta({ example: "SKU-001" }),
    name: z.string().meta({ example: "Teclado mecanico" }),
    description: z.string().nullable().meta({ example: "Teclado mecanico RGB" }),
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
      name: "Teclado mecanico",
      price: "129.90",
      stock: 25,
    },
  });

export const createProductSchema = z
  .object({
    sku: z.string().min(1).max(64).meta({ example: "SKU-001" }),
    name: z.string().min(1).max(255).meta({ example: "Teclado mecanico" }),
    description: z.string().max(2000).optional().meta({ example: "Teclado mecanico RGB" }),
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
      name: "Teclado mecanico",
      categoryId: 1,
      price: "129.90",
      cost: "75.00",
      stock: 25,
      minStock: 5,
    },
  });

export const updateProductSchema = createProductSchema.partial().meta({
  id: "UpdateProduct",
  example: { price: "139.90", stock: 20 },
});

export const productListQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().optional().meta({ example: "teclado" }),
    categoryId: z.coerce.number().int().positive().optional().meta({ example: 1 }),
    isActive: z.coerce.boolean().optional().meta({ example: true }),
  })
  .meta({
    id: "ProductListQuery",
    example: { page: 1, pageSize: 20, search: "teclado", categoryId: 1 },
  });

export type Product = z.infer<typeof productSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
