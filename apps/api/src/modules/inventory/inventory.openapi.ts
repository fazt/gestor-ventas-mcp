/// <reference types="zod-openapi" />
import {
  adjustStockSchema,
  paginatedResponseSchema,
  productSchema,
  stockMovementListQuerySchema,
  stockMovementSchema,
} from "@gestor/shared";
import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";

const paginatedMovementsSchema = paginatedResponseSchema(stockMovementSchema).meta({
  id: "PaginatedStockMovements",
});

const lowStockListSchema = z
  .object({
    data: z.array(productSchema),
  })
  .meta({ id: "LowStockList" });

const adjustStockResponseSchema = z
  .object({
    product: productSchema,
    movement: stockMovementSchema,
  })
  .meta({ id: "AdjustStockResponse" });

export const inventoryPaths: ZodOpenApiPathsObject = {
  "/api/inventory/movements": {
    get: {
      tags: ["Inventario"],
      summary: "Historial de movimientos",
      requestParams: { query: stockMovementListQuerySchema },
      responses: {
        200: {
          description: "Movimientos paginados",
          content: { "application/json": { schema: paginatedMovementsSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
  },
  "/api/inventory/low-stock": {
    get: {
      tags: ["Inventario"],
      summary: "Productos bajo stock mínimo",
      responses: {
        200: {
          description: "Productos activos con stock <= minStock",
          content: { "application/json": { schema: lowStockListSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
  },
  "/api/inventory/adjust": {
    post: {
      tags: ["Inventario"],
      summary: "Ajuste manual de stock",
      description:
        "`in` suma quantity al stock. `adjustment` fija el stock en quantity y audita el delta.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: adjustStockSchema } },
      },
      responses: {
        201: {
          description: "Stock ajustado",
          content: { "application/json": { schema: adjustStockResponseSchema } },
        },
        400: { $ref: "#/components/responses/BadRequest" },
        401: { $ref: "#/components/responses/Unauthorized" },
        404: { $ref: "#/components/responses/NotFound" },
      },
    },
  },
};
