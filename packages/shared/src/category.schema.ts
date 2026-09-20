/// <reference types="zod-openapi" />
import { z } from "zod";

export const categorySchema = z
  .object({
    id: z.number().int().meta({ example: 1 }),
    name: z.string().meta({ example: "Electrónica" }),
    description: z.string().nullable().meta({ example: "Periféricos y dispositivos" }),
    createdAt: z.string().meta({ example: "2026-01-15T10:00:00.000Z" }),
    updatedAt: z.string().meta({ example: "2026-01-15T10:00:00.000Z" }),
  })
  .meta({
    id: "Category",
    example: {
      id: 1,
      name: "Electrónica",
      description: "Periféricos y dispositivos",
      createdAt: "2026-01-15T10:00:00.000Z",
      updatedAt: "2026-01-15T10:00:00.000Z",
    },
  });

export const createCategorySchema = z
  .object({
    name: z.string().min(1).max(255).meta({ example: "Electrónica" }),
    description: z
      .string()
      .max(1000)
      .optional()
      .meta({ example: "Periféricos y dispositivos" }),
  })
  .meta({
    id: "CreateCategory",
    example: { name: "Electrónica", description: "Periféricos y dispositivos" },
  });

export const updateCategorySchema = createCategorySchema.partial().meta({
  id: "UpdateCategory",
  example: { name: "Electrónica", description: "Periféricos actualizados" },
});

export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
