import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { resolve } from "node:path";
import pg from "pg";
import * as schema from "./schema.js";

config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
config({ path: resolve(process.cwd(), ".env"), quiet: true });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
/** Tipo de la transacción de drizzle, para funciones que aceptan `db` o `tx`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function closeDb(): Promise<void> {
  await pool.end();
}
