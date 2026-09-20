/// <reference types="zod-openapi" />
import {
  createSaleSchema,
  paginatedResponseSchema,
  saleDetailSchema,
  saleListQuerySchema,
  saleSchema,
} from "@gestor/shared";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { idParamSchema } from "../../lib/params.js";

const paginatedSalesSchema = paginatedResponseSchema(saleSchema).meta({
  id: "PaginatedSales",
});

export const salePaths: ZodOpenApiPathsObject = {
  "/api/sales": {
    get: {
      tags: ["Ventas"],
      summary: "Listar ventas",
      requestParams: { query: saleListQuerySchema },
      responses: {
        200: {
          description: "Listado paginado",
          content: { "application/json": { schema: paginatedSalesSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
    post: {
      tags: ["Ventas"],
      summary: "Registrar venta",
      description:
        "Transacción: bloquea productos, valida stock, snapshot de precios, descuenta stock y registra movimientos `out`.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: createSaleSchema } },
      },
      responses: {
        201: {
          description: "Venta registrada",
          content: { "application/json": { schema: saleDetailSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
        404: { $ref: "#/components/responses/NotFound" },
        409: { $ref: "#/components/responses/Conflict" },
      },
    },
  },
  "/api/sales/{id}": {
    get: {
      tags: ["Ventas"],
      summary: "Detalle de venta",
      requestParams: { path: idParamSchema },
      responses: {
        200: {
          description: "Venta con ítems",
          content: { "application/json": { schema: saleDetailSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
        404: { $ref: "#/components/responses/NotFound" },
      },
    },
  },
  "/api/sales/{id}/cancel": {
    post: {
      tags: ["Ventas"],
      summary: "Cancelar venta",
      description: "Marca la venta como cancelada, restaura stock y registra movimientos `in`.",
      requestParams: { path: idParamSchema },
      responses: {
        200: {
          description: "Venta cancelada",
          content: { "application/json": { schema: saleDetailSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
        404: { $ref: "#/components/responses/NotFound" },
        409: { $ref: "#/components/responses/Conflict" },
      },
    },
  },
};
