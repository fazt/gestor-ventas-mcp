import { db, pool, users } from "@gestor/db";
import { eq } from "drizzle-orm";
import { env } from "../lib/env.js";
import { signApiToken } from "../lib/jwt.js";

const DEFAULT_EMAIL = "admin@ventas.com";
const DEFAULT_TTL = "7d";

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match?.[1]) {
      args.set(match[1], match[2] ?? "");
    }
  }
  return args;
}

/** Acepta segundos ("900"), sufijos s/m/h/d ("30m", "7d") o "never" (devuelve 0). */
function parseTtl(value: string): number {
  const raw = value.trim().toLowerCase();
  if (raw === "never") {
    return 0;
  }
  const match = /^(\d+)([smhd]?)$/.exec(raw);
  if (!match) {
    throw new Error(`TTL inválido: "${value}". Usa 900, 30m, 7d o never.`);
  }
  const amount = Number(match[1]);
  const unit = match[2] || "s";
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
  return amount * factor;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.get("email") ?? DEFAULT_EMAIL;
  const ttlSeconds = parseTtl(args.get("ttl") ?? DEFAULT_TTL);

  if (ttlSeconds === 0 && env.NODE_ENV === "production") {
    throw new Error("--ttl=never no está permitido con NODE_ENV=production.");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new Error(`No existe el usuario ${email}. Ejecuta "pnpm db:seed" o pasa --email=...`);
  }
  if (!user.isActive) {
    throw new Error(`El usuario ${email} está inactivo: la API rechazará su token.`);
  }

  const token = signApiToken(
    {
      sub: String(user.id),
      role: user.role,
      email: user.email,
      name: user.name,
    },
    ttlSeconds,
  );

  const baseUrl = `http://localhost:${env.PORT}`;
  const expira =
    ttlSeconds === 0
      ? "nunca (token sin exp, solo para pruebas locales)"
      : `${new Date(Date.now() + ttlSeconds * 1000).toLocaleString()} (${ttlSeconds}s)`;

  console.log(`Usuario:  ${user.name} <${user.email}> (${user.role})`);
  console.log(`Expira:   ${expira}`);
  console.log(`Emisor:   ${env.PUBLIC_URL}`);
  console.log("");
  console.log(token);
  console.log("");
  console.log("Ejemplo:");
  console.log(`  curl -H "Authorization: Bearer ${token}" ${baseUrl}/api/auth/me`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
