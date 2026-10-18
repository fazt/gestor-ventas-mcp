/// <reference types="zod-openapi" />
import { z } from "zod";
import { publicUserSchema, userRoleSchema } from "./auth.schema.js";

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128)
  .meta({ example: "cambia-esta-clave" });

export const userSchema = publicUserSchema
  .extend({
    createdAt: z.string().meta({ example: "2026-01-15T10:00:00.000Z" }),
  })
  .meta({ id: "User" });

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(255).meta({ example: "Lucía Vendedora" }),
    email: z.email().max(255).transform((value) => value.toLowerCase()).meta({ example: "lucia@ventas.com" }),
    password: passwordSchema,
    role: userRoleSchema.default("seller"),
  })
  .meta({ id: "CreateUser" });

/** Edición parcial sin defaults (ver nota en updateProductSchema). */
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    role: userRoleSchema.optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  })
  .meta({ id: "UpdateUser" });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .meta({ id: "ChangePassword" });

export type User = z.infer<typeof userSchema>;
export type CreateUserInput = z.input<typeof createUserSchema>;
export type CreateUserData = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
