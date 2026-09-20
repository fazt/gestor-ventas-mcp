import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { resolve } from "node:path";
import pg from "pg";
import * as schema from "./schema.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool, { schema });
