/// <reference types="zod-openapi" />
import { z } from "zod";

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).meta({ example: 1 }),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .meta({ example: 20 }),
  })
  .meta({
    id: "PaginationQuery",
    example: { page: 1, pageSize: 20 },
  });

export const paginatedMetaSchema = z
  .object({
    total: z.number().int().meta({ example: 42 }),
    page: z.number().int().meta({ example: 1 }),
    pageSize: z.number().int().meta({ example: 20 }),
  })
  .meta({ id: "PaginatedMeta" });

export function paginatedResponseSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
}

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginatedMeta = z.infer<typeof paginatedMetaSchema>;
export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};
