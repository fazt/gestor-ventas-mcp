/// <reference types="zod-openapi" />
import {
  categorySchema,
  createCategorySchema,
  updateCategorySchema,
} from "@gestor/shared";
import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { idParamSchema } from "../../lib/params.js";

const categoryListSchema = z
  .object({
    data: z.array(categorySchema),
  })
  .meta({ id: "CategoryList" });

export const categoryPaths: ZodOpenApiPathsObject = {
  "/api/categories": {
    get: {
      tags: ["Categorias"],
      summary: "Listar categorías",
      responses: {
        200: {
          description: "Listado de categorías",
          content: { "application/json": { schema: categoryListSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
    post: {
      tags: ["Categorias"],
      summary: "Crear categoría",
      requestBody: {
        required: true,
        content: { "application/json": { schema: createCategorySchema } },
      },
      responses: {
        201: {
          description: "Categoría creada",
          content: { "application/json": { schema: categorySchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
        409: { $ref: "#/components/responses/Conflict" },
      },
    },
  },
  "/api/categories/{id}": {
    get: {
      tags: ["Categorias"],
      summary: "Obtener una categoría",
      requestParams: { path: idParamSchema },
      responses: {
        200: {
          description: "Categoría",
          content: { "application/json": { schema: categorySchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
        404: { $ref: "#/components/responses/NotFound" },
      },
    },
    put: {
      tags: ["Categorias"],
      summary: "Actualizar categoría (admin)",
      requestParams: { path: idParamSchema },
      requestBody: {
        required: true,
        content: { "application/json": { schema: updateCategorySchema } },
      },
      responses: {
        200: {
          description: "Categoría actualizada",
          content: { "application/json": { schema: categorySchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
        403: { $ref: "#/components/responses/Forbidden" },
        404: { $ref: "#/components/responses/NotFound" },
        409: { $ref: "#/components/responses/Conflict" },
      },
    },
    delete: {
      tags: ["Categorias"],
      summary: "Eliminar categoría (admin)",
      requestParams: { path: idParamSchema },
      responses: {
        204: { description: "Eliminada" },
        401: { $ref: "#/components/responses/Unauthorized" },
        403: { $ref: "#/components/responses/Forbidden" },
        404: { $ref: "#/components/responses/NotFound" },
        409: { $ref: "#/components/responses/Conflict" },
      },
    },
  },
};
