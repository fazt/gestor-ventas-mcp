import { categories, db, pool, products, users } from "@gestor/db";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import request from "supertest";
import { createApp } from "../src/app.js";

export const app = createApp();
export const PASSWORD = "clave-segura-123";

/** Vacía todas las tablas de la base de test (menos el historial de migraciones). */
export async function resetDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL?.includes("test")) {
    throw new Error("resetDatabase solo se ejecuta contra una base de test");
  }
  const result = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  if (result.rows.length === 0) return;
  const tables = result.rows.map((row) => `"public"."${row.tablename}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`));
}

let counter = 0;

export async function createUser(role: "admin" | "seller", isActive = true) {
  counter += 1;
  const email = `${role}${Date.now()}${counter}@test.dev`;
  const [user] = await db
    .insert(users)
    .values({
      name: role === "admin" ? `Admin ${counter}` : `Vendedor ${counter}`,
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role,
      isActive,
    })
    .returning();
  if (!user) throw new Error("No se pudo crear el usuario de test");
  return user;
}

/** Inicia sesión y devuelve un agente con la cookie del panel. */
export async function loginAgent(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: PASSWORD }).expect(200);
  return agent;
}

export async function createCatalog() {
  const [category] = await db.insert(categories).values({ name: `Cat ${Date.now()}${counter++}` }).returning();
  if (!category) throw new Error("categoría");
  const rows = await db
    .insert(products)
    .values([
      { sku: `A-${counter}`, name: "Cable", categoryId: category.id, price: "0.10", cost: "0.05", stock: 10, minStock: 2 },
      { sku: `B-${counter}`, name: "Mouse", categoryId: category.id, price: "49.90", cost: "22.00", stock: 1, minStock: 1 },
      { sku: `C-${counter}`, name: "=HYPERLINK(\"x\")", categoryId: category.id, price: "19.99", cost: "5.00", stock: 5, minStock: 0 },
    ])
    .returning();
  const [cable, mouse, formula] = rows;
  if (!cable || !mouse || !formula) throw new Error("productos");
  return { category, cable, mouse, formula };
}

/** Llamada JSON-RPC al endpoint MCP (Streamable HTTP con respuestas JSON). */
export async function mcpCall(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
  sessionId?: string,
) {
  const req = request(app)
    .post("/mcp")
    .set("Authorization", `Bearer ${token}`)
    .set("Accept", "application/json, text/event-stream")
    .set("Content-Type", "application/json");
  if (sessionId) req.set("Mcp-Session-Id", sessionId);
  if (sessionId) req.set("MCP-Protocol-Version", "2025-06-18");
  return req.send({ jsonrpc: "2.0", id: Math.floor(Math.random() * 1e6), method, params });
}

export async function mcpSession(token: string): Promise<string> {
  const res = await mcpCall(token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "vitest", version: "0.0.0" },
  });
  if (res.status !== 200) throw new Error(`initialize ${res.status}: ${res.text}`);
  const sessionId = res.headers["mcp-session-id"];
  if (typeof sessionId !== "string") throw new Error("sin Mcp-Session-Id");
  await request(app)
    .post("/mcp")
    .set("Authorization", `Bearer ${token}`)
    .set("Accept", "application/json, text/event-stream")
    .set("Mcp-Session-Id", sessionId)
    .set("MCP-Protocol-Version", "2025-06-18")
    .send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return sessionId;
}

/** Ejecuta una tool y devuelve { isError, data } con el JSON de la respuesta ya parseado. */
export async function callTool(token: string, sessionId: string, name: string, args: Record<string, unknown> = {}) {
  const res = await mcpCall(token, "tools/call", { name, arguments: args }, sessionId);
  if (res.status !== 200) throw new Error(`tools/call ${res.status}: ${res.text}`);
  const result = res.body.result as { isError?: boolean; content: Array<{ text: string }> };
  return { isError: Boolean(result.isError), data: JSON.parse(result.content[0]?.text ?? "null") as any };
}

export { db, pool, request };
