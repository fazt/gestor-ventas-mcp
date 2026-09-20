/// <reference types="zod-openapi" />
import { loginResponseSchema, loginSchema, meResponseSchema } from "@gestor/shared";
import type { ZodOpenApiPathsObject } from "zod-openapi";

export const authPaths: ZodOpenApiPathsObject = {
  "/api/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "Iniciar sesión",
      security: [],
      requestBody: {
        required: true,
        content: { "application/json": { schema: loginSchema } },
      },
      responses: {
        200: {
          description: "Sesión iniciada. Cookie httpOnly `token` emitida.",
          content: { "application/json": { schema: loginResponseSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
  },
  "/api/auth/logout": {
    post: {
      tags: ["Auth"],
      summary: "Cerrar sesión",
      security: [],
      responses: {
        204: { description: "Cookie eliminada" },
      },
    },
  },
  "/api/auth/me": {
    get: {
      tags: ["Auth"],
      summary: "Usuario autenticado",
      responses: {
        200: {
          description: "Perfil actual",
          content: { "application/json": { schema: meResponseSchema } },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
  },
};
