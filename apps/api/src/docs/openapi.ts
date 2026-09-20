/// <reference types="zod-openapi" />
import { z } from "zod";
import { createDocument } from "zod-openapi";
import { authPaths } from "../modules/auth/auth.openapi.js";
import { categoryPaths } from "../modules/categories/categories.openapi.js";
import { dashboardPaths } from "../modules/dashboard/dashboard.openapi.js";
import { inventoryPaths } from "../modules/inventory/inventory.openapi.js";
import { productPaths } from "../modules/products/products.openapi.js";
import { salePaths } from "../modules/sales/sales.openapi.js";

export const errorResponseSchema = z
  .object({
    statusCode: z.number().int(),
    message: z.string(),
  })
  .meta({ id: "ErrorResponse" });

function errorResponse(description: string, example: { statusCode: number; message: string }) {
  return {
    description,
    content: {
      "application/json": {
        schema: errorResponseSchema,
        example,
      },
    },
  };
}

export const openApiDocument = createDocument({
  openapi: "3.1.0",
  info: {
    title: "Gestor de Ventas API",
    version: "1.0.0",
    description:
      "API del gestor de ventas. Autenticación por cookie httpOnly `token`. Ejecuta POST /api/auth/login desde Swagger UI para autenticar el resto de endpoints.",
  },
  tags: [
    { name: "Auth", description: "Inicio y cierre de sesión" },
    { name: "Productos", description: "Catálogo de productos" },
    { name: "Categorias", description: "Categorías del catálogo" },
    { name: "Ventas", description: "Registro y cancelación de ventas" },
    { name: "Inventario", description: "Movimientos y ajustes de stock" },
    { name: "Dashboard", description: "Métricas agregadas" },
  ],
  security: [{ cookieAuth: [] }],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "token",
      },
    },
    responses: {
      BadRequest: errorResponse("Solicitud inválida", {
        statusCode: 400,
        message: "Datos inválidos",
      }),
      Unauthorized: errorResponse("No autenticado", {
        statusCode: 401,
        message: "No autenticado",
      }),
      Forbidden: errorResponse("Sin permisos", {
        statusCode: 403,
        message: "No autorizado",
      }),
      NotFound: errorResponse("No encontrado", {
        statusCode: 404,
        message: "Recurso no encontrado",
      }),
      Conflict: errorResponse("Conflicto (SKU duplicado o stock insuficiente)", {
        statusCode: 409,
        message: "Stock insuficiente",
      }),
    },
  },
  paths: {
    ...authPaths,
    ...productPaths,
    ...categoryPaths,
    ...salePaths,
    ...inventoryPaths,
    ...dashboardPaths,
  },
});
