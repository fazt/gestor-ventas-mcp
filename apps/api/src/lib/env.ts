import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

function resolvePublicUrl(explicit: string | undefined, port: number): string {
  if (explicit?.startsWith("https://")) {
    return explicit.replace(/\/$/, "");
  }
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (railwayDomain) {
    return `https://${railwayDomain}`;
  }
  return explicit && explicit.length > 0 ? explicit.replace(/\/$/, "") : `http://localhost:${port}`;
}

const booleanFromEnv = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(8),
    PORT: z.coerce.number().int().positive().default(4070),
    /** Orígenes del panel permitidos por CORS (separados por coma). */
    WEB_ORIGIN: z.string().default("http://127.0.0.1:5239,http://localhost:5239"),
    /** URL pública de la API: issuer OAuth y `resource` del servidor MCP. */
    PUBLIC_URL: z.string().optional(),
    RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
    /** Saltos de proxy de confianza para leer la IP real (X-Forwarded-For). */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
    /** Zona horaria de la tienda: define "hoy", "este mes" y los filtros por fecha. */
    STORE_TIMEZONE: z.string().default("America/Lima"),
    STORE_CURRENCY: z.string().length(3).default("PEN"),
    STORE_NAME: z.string().min(1).max(120).default("Gestor de ventas"),
    /**
     * Impuesto que se suma a (subtotal − descuento) cuando la venta no trae `tax`
     * explícito. 0 = precios con impuesto incluido o negocio exonerado.
     */
    STORE_TAX_RATE: z.coerce.number().min(0).max(100).default(0),
    STORE_TAX_NAME: z.string().min(1).max(20).default("IGV"),
    /** `lax` si panel y API comparten dominio (o pasan por el proxy de Next); `none` si no. */
    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    COOKIE_SECURE: booleanFromEnv.optional(),
    /** Desactiva los límites en local o en tests de carga. */
    RATE_LIMIT_ENABLED: booleanFromEnv.default(true),
    LOGIN_MAX_FAILED_PER_15M: z.coerce.number().int().positive().default(10),
    OAUTH_REGISTER_MAX_PER_HOUR: z.coerce.number().int().positive().default(20),
    MCP_MAX_REQUESTS_PER_MIN: z.coerce.number().int().positive().default(240),
    MCP_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    MCP_MAX_SESSIONS_PER_USER: z.coerce.number().int().positive().default(10),
    /** Días que se conserva la bitácora de tools MCP (0 = no purgar). */
    MCP_AUDIT_RETENTION_DAYS: z.coerce.number().int().min(0).default(90),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (data.JWT_SECRET.length < 32 || /change-me|cambia/i.test(data.JWT_SECRET)) {
        ctx.addIssue({
          code: "custom",
          path: ["JWT_SECRET"],
          message: "En producción JWT_SECRET debe tener al menos 32 caracteres aleatorios",
        });
      }
    }
    try {
      new Intl.DateTimeFormat("es", { timeZone: data.STORE_TIMEZONE });
    } catch {
      ctx.addIssue({ code: "custom", path: ["STORE_TIMEZONE"], message: "Zona horaria IANA inválida" });
    }
  })
  .transform((data) => ({
    ...data,
    PUBLIC_URL: resolvePublicUrl(data.PUBLIC_URL, data.PORT),
    WEB_ORIGINS: data.WEB_ORIGIN.split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
    COOKIE_SECURE: data.COOKIE_SECURE ?? (data.NODE_ENV === "production" || data.COOKIE_SAMESITE === "none"),
  }));

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    console.error(`Variables de entorno inválidas:\n${lines.join("\n")}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
