import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Antes de la suite: crea la base de test si no existe y aplica las migraciones de
 * packages/db/drizzle (las mismas que corre `pnpm db:migrate` en producción).
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !url.includes("test")) {
    throw new Error("TEST_DATABASE_URL debe apuntar a una base cuyo nombre contenga 'test'");
  }

  const target = new URL(url);
  const dbName = target.pathname.replace(/^\//, "");
  const admin = new URL(url);
  admin.pathname = "/postgres";

  const adminClient = new pg.Client({ connectionString: admin.toString() });
  await adminClient.connect();
  try {
    const exists = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (exists.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE "${dbName.replaceAll('"', "")}"`);
    }
  } finally {
    await adminClient.end();
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
