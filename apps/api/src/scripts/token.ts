/**
 * Crea un token personal (PAT) desde la terminal, útil para conectar Claude Code o
 * scripts sin abrir el panel. Equivale a "Integraciones → Nuevo token".
 *
 *   pnpm api:token                                   # admin, read+write, 90 días
 *   pnpm api:token -- --email=vendedor@ventas.com --scopes=read
 *   pnpm api:token -- --name="CI" --days=7
 *   pnpm api:token -- --days=never                   # sin vencimiento
 */
import { db, pool, users } from "@gestor/db";
import { createApiTokenSchema, type ApiTokenScope } from "@gestor/shared";
import { eq } from "drizzle-orm";
import { env } from "../lib/env.js";
import { mcpResourceUrl } from "../lib/urls.js";
import { createApiToken } from "../modules/tokens/tokens.service.js";

const DEFAULT_EMAIL = "admin@ventas.com";

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = (args.get("email") ?? DEFAULT_EMAIL).toLowerCase();
  const rawDays = args.get("days") ?? "90";
  const scopes = (args.get("scopes") ?? "read,write")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean) as ApiTokenScope[];

  const input = createApiTokenSchema.parse({
    name: args.get("name") ?? `Terminal ${new Date().toISOString().slice(0, 10)}`,
    scopes,
    expiresInDays: rawDays === "never" ? null : Number(rawDays),
  });

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new Error(`No existe el usuario ${email}. Ejecuta "pnpm db:seed" o pasa --email=...`);
  }
  if (!user.isActive) {
    throw new Error(`El usuario ${email} está inactivo.`);
  }

  const created = await createApiToken(user.id, input);

  console.log(`Usuario:  ${user.name} <${user.email}> (${user.role})`);
  console.log(`Token:    ${created.name} · permisos ${created.scopes.join("+")}`);
  console.log(`Vence:    ${created.expiresAt ?? "nunca"}`);
  console.log("");
  console.log(created.token);
  console.log("");
  console.log("Se muestra una sola vez. Ejemplos:");
  console.log(`  curl -H "Authorization: Bearer ${created.token}" ${env.PUBLIC_URL}/api/auth/me`);
  console.log(
    `  claude mcp add --transport http gestor-ventas ${mcpResourceUrl()} --header "Authorization: Bearer ${created.token}"`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
