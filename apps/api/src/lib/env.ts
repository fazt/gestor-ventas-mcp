import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

function resolvePublicUrl(explicit: string | undefined): string {
  if (explicit?.startsWith("https://")) {
    return explicit.replace(/\/$/, "");
  }
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (railwayDomain) {
    return `https://${railwayDomain}`;
  }
  return explicit && explicit.length > 0 ? explicit.replace(/\/$/, "") : "http://localhost:4000";
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  PUBLIC_URL: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
}).transform((data) => ({
  ...data,
  PUBLIC_URL: resolvePublicUrl(data.PUBLIC_URL),
}));

export const env = envSchema.parse(process.env);
