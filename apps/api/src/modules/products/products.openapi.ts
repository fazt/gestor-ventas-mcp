/// <reference types="zod-openapi" />
import {
  createProductSchema,
  paginatedResponseSchema,
  productListQuerySchema,
  productSchema,
  updateProductSchema,
} from "@gestor/shared";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { idParamSchema } from "../../lib/params.js";

const paginatedProductsSchema = paginatedResponseSchema(productSchema).meta({
  id: "PaginatedProducts",
});

export const productPaths: ZodOpenApiPathsObject = {
  "/api/products": {
    get: {
      tags: ["Productos"],
      summary: "Listar productos",
      requestParams: { query: productListQuerySchema },
      responses: {
        200: {
          description: "Listado paginado",
          content: { "application/json": { schema: paginatedProductsSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
    post: {
      tags: ["Productos"],
      summary: "Crear producto",
      requestBody: {
        required: true,
        content: { "application/json": { schema: createProductSchema } },
      },
      responses: {
        201: {
          description: "Producto creado",
          content: { "application/json": { schema: productSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
        404: { $ref: "#/components/responses/NotFound" },
        409: { $ref: "#/components/responses/Conflict" },
      },
    },
  },
  "/api/products/{id}": {
    get: {
      tags: ["Productos"],
      summary: "Obtener producto",
      requestParams: { path: idParamSchema },
      responses: {
        200: {
          description: "Producto",
          content: { "application/json": { schema: productSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
        404: { $ref: "#/components/responses/NotFound" },
      },
    },
    put: {
      tags: ["Productos"],
      summary: "Actualizar un producto",
      requestParams: { path: idParamSchema },
      requestBody: {
        required: true,
        content: { "application/json": { schema: updateProductSchema } },
      },
      responses: {
        200: {
          description: "Producto actualizado",
          content: { "application/json": { schema: productSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
        403: { $ref: "#/components/responses/Forbidden" },
        404: { $ref: "#/components/responses/NotFound" },
        409: { $ref: "#/components/responses/Conflict" },
      },
    },
    delete: {
      tags: ["Productos"],
      summary: "Desactivar producto (soft delete)",
      requestParams: { path: idParamSchema },
      responses: {
        200: {
          description: "Producto desactivado",
          content: { "application/json": { schema: productSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
        403: { $ref: "#/components/responses/Forbidden" },
        404: { $ref: "#/components/responses/NotFound" },
      },
    },
  },
};
