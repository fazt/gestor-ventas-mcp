/// <reference types="zod-openapi" />
import { z } from "zod";

export const userRoleSchema = z.enum(["admin", "seller"]).meta({
  id: "UserRole",
  example: "admin",
});

export const loginSchema = z
  .object({
    email: z.email().meta({ example: "admin@ventas.com" }),
    password: z.string().min(6).meta({ example: "admin123" }),
  })
  .meta({
    id: "LoginRequest",
    example: { email: "admin@ventas.com", password: "admin123" },
  });

export const publicUserSchema = z
  .object({
    id: z.number().int().meta({ example: 1 }),
    name: z.string().meta({ example: "Administrador" }),
    email: z.email().meta({ example: "admin@ventas.com" }),
    role: userRoleSchema,
    isActive: z.boolean().meta({ example: true }),
  })
  .meta({
    id: "PublicUser",
    example: {
      id: 1,
      name: "Administrador",
      email: "admin@ventas.com",
      role: "admin",
      isActive: true,
    },
  });

export const loginResponseSchema = z
  .object({
    user: publicUserSchema,
  })
  .meta({
    id: "LoginResponse",
    example: {
      user: {
        id: 1,
        name: "Administrador",
        email: "admin@ventas.com",
        role: "admin",
        isActive: true,
      },
    },
  });

export const meResponseSchema = loginResponseSchema.meta({ id: "MeResponse" });

export type UserRole = z.infer<typeof userRoleSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
