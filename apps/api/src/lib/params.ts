/// <reference types="zod-openapi" />
import { z } from "zod";

export const idParamSchema = z
  .object({
    id: z.coerce.number().int().positive().meta({ example: 1 }),
  })
  .meta({ id: "IdParam" });
