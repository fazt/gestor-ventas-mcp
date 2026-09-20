/// <reference types="zod-openapi" />
import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  dashboardSummarySchema,
  salesChartQuerySchema,
  salesChartSchema,
  topProductsQuerySchema,
  topProductsSchema,
} from "./dashboard.schema.js";

export const dashboardPaths: ZodOpenApiPathsObject = {
  "/api/dashboard/summary": {
    get: {
      tags: ["Dashboard"],
      summary: "Resumen de métricas",
      responses: {
        200: {
          description: "Ventas de hoy, del mes, ticket promedio y productos bajo stock",
          content: { "application/json": { schema: dashboardSummarySchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
  },
  "/api/dashboard/sales-chart": {
    get: {
      tags: ["Dashboard"],
      summary: "Ventas por día",
      requestParams: { query: salesChartQuerySchema },
      responses: {
        200: {
          description: "Serie diaria",
          content: { "application/json": { schema: salesChartSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
  },
  "/api/dashboard/top-products": {
    get: {
      tags: ["Dashboard"],
      summary: "Productos más vendidos",
      requestParams: { query: topProductsQuerySchema },
      responses: {
        200: {
          description: "Ranking por cantidad vendida",
          content: { "application/json": { schema: topProductsSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
  },
};
