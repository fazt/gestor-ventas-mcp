/// <reference types="zod-openapi" />
import {
  apiTokenSchema,
  cancelSaleSchema,
  changePasswordSchema,
  createApiTokenSchema,
  createdApiTokenSchema,
  createUserSchema,
  mcpAuditLogSchema,
  mcpAuditQuerySchema,
  saleDetailSchema,
  saleExportQuerySchema,
  updateUserSchema,
  userSchema,
} from "@gestor/shared";
import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { idParamSchema } from "../lib/params.js";
import { reportQuerySchema } from "../modules/dashboard/dashboard.schema.js";

const unauthorized = { $ref: "#/components/responses/Unauthorized" } as const;
const forbidden = { $ref: "#/components/responses/Forbidden" } as const;
const badRequest = { $ref: "#/components/responses/BadRequest" } as const;
const notFound = { $ref: "#/components/responses/NotFound" } as const;

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

/** Endpoints añadidos en la versión de producción: equipo, tokens, bitácora MCP y reportes. */
export const extraPaths: ZodOpenApiPathsObject = {
  "/api/auth/password": {
    post: {
      tags: ["Auth"],
      summary: "Cambiar mi contraseña",
      requestBody: { required: true, content: { "application/json": { schema: changePasswordSchema } } },
      responses: { 204: { description: "Contraseña actualizada" }, 400: badRequest, 401: unauthorized },
    },
  },
  "/api/sales/export.csv": {
    get: {
      tags: ["Ventas"],
      summary: "Exportar ventas a CSV",
      description: "Mismos filtros que el listado. Hasta 50 000 filas, UTF-8 con BOM, celdas protegidas contra fórmulas.",
      requestParams: { query: saleExportQuerySchema },
      responses: {
        200: { description: "Archivo CSV", content: { "text/csv": { schema: z.string() } } },
        401: unauthorized,
      },
    },
  },
  "/api/sales/{id}/cancel": {
    post: {
      tags: ["Ventas"],
      summary: "Cancelar venta y reponer stock",
      description: "Admin: cualquier venta. Vendedor: solo las suyas del mismo día.",
      requestParams: { path: idParamSchema },
      requestBody: { required: false, content: { "application/json": { schema: cancelSaleSchema } } },
      responses: {
        200: json(saleDetailSchema, "Venta cancelada"),
        403: forbidden,
        404: notFound,
        409: { $ref: "#/components/responses/Conflict" },
      },
    },
  },
  "/api/dashboard/report": {
    get: {
      tags: ["Dashboard"],
      summary: "Reporte por rango de fechas",
      requestParams: { query: reportQuerySchema },
      responses: { 200: { description: "Totales, margen y desgloses" }, 400: badRequest, 401: unauthorized },
    },
  },
  "/api/dashboard/settings": {
    get: {
      tags: ["Dashboard"],
      summary: "Configuración de la tienda (moneda, impuesto, zona horaria)",
      responses: { 200: { description: "Configuración" }, 401: unauthorized },
    },
  },
  "/api/users": {
    get: {
      tags: ["Equipo"],
      summary: "Listar usuarios (admin)",
      responses: { 200: json(z.object({ data: z.array(userSchema) }), "Usuarios"), 401: unauthorized, 403: forbidden },
    },
    post: {
      tags: ["Equipo"],
      summary: "Crear usuario (admin)",
      requestBody: { required: true, content: { "application/json": { schema: createUserSchema } } },
      responses: { 201: json(userSchema, "Usuario creado"), 400: badRequest, 403: forbidden, 409: { $ref: "#/components/responses/Conflict" } },
    },
  },
  "/api/users/{id}": {
    patch: {
      tags: ["Equipo"],
      summary: "Editar usuario (admin): nombre, rol, estado o contraseña",
      requestParams: { path: idParamSchema },
      requestBody: { required: true, content: { "application/json": { schema: updateUserSchema } } },
      responses: { 200: json(userSchema, "Usuario actualizado"), 400: badRequest, 403: forbidden, 404: notFound },
    },
  },
  "/api/tokens": {
    get: {
      tags: ["Integraciones"],
      summary: "Mis tokens personales",
      responses: { 200: json(z.object({ data: z.array(apiTokenSchema), mcpUrl: z.string() }), "Tokens"), 401: unauthorized },
    },
    post: {
      tags: ["Integraciones"],
      summary: "Crear token personal (se muestra una sola vez)",
      requestBody: { required: true, content: { "application/json": { schema: createApiTokenSchema } } },
      responses: { 201: json(createdApiTokenSchema, "Token creado"), 400: badRequest, 401: unauthorized },
    },
  },
  "/api/tokens/{id}": {
    delete: {
      tags: ["Integraciones"],
      summary: "Revocar token personal",
      requestParams: { path: idParamSchema },
      responses: { 200: json(apiTokenSchema, "Token revocado"), 404: notFound },
    },
  },
  "/api/mcp/activity": {
    get: {
      tags: ["Integraciones"],
      summary: "Bitácora de tools MCP (admin: todo el equipo; vendedor: lo suyo)",
      requestParams: { query: mcpAuditQuerySchema },
      responses: {
        200: json(
          z.object({ data: z.array(mcpAuditLogSchema), total: z.number(), page: z.number(), pageSize: z.number() }),
          "Llamadas",
        ),
        401: unauthorized,
      },
    },
  },
};
