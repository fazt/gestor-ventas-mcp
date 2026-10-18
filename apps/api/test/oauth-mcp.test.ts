import { createHash, randomBytes } from "node:crypto";
import { mcpAuditLogs } from "@gestor/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  app,
  callTool,
  createCatalog,
  createUser,
  db,
  loginAgent,
  mcpCall,
  mcpSession,
  request,
  resetDatabase,
} from "./helpers.js";

const RESOURCE = "http://127.0.0.1:4070/mcp";
const REDIRECT = "http://127.0.0.1:9/callback";

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function registerClient() {
  const res = await request(app)
    .post("/oauth/register")
    .send({ client_name: "Cliente de prueba", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" })
    .expect(201);
  return res.body.client_id as string;
}

function authorizeParams(clientId: string, challenge: string) {
  return {
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: RESOURCE,
    state: "xyz",
  };
}

async function createPat(email: string, scopes: string[]) {
  const agent = await loginAgent(email);
  const res = await agent.post("/api/tokens").send({ name: "Claude Code", scopes, expiresInDays: 30 }).expect(201);
  return { token: res.body.token as string, id: res.body.id as number, agent };
}

describe("OAuth 2.1 para conectores MCP", () => {
  beforeEach(resetDatabase);

  it("con sesión iniciada pide consentimiento en vez de emitir el código sin preguntar", async () => {
    const admin = await createUser("admin");
    const clientId = await registerClient();
    const { challenge } = pkce();
    const agent = await loginAgent(admin.email);

    const page = await agent.get("/oauth/authorize").query(authorizeParams(clientId, challenge)).expect(200);
    expect(page.text).toContain("¿Autorizar a Cliente de prueba?");
    expect(page.headers["x-frame-options"]).toBe("DENY");

    // Sin el token anti-CSRF de la página (p. ej. un formulario de otro sitio) no hay código.
    const forged = await agent
      .post("/oauth/authorize")
      .type("form")
      .send({ ...authorizeParams(clientId, challenge), decision: "allow" });
    expect(forged.status).toBe(400);
    expect(forged.headers.location).toBeUndefined();

    const csrf = /name="csrf" value="([^"]+)"/.exec(page.text)?.[1];
    expect(csrf).toBeTruthy();
    const ok = await agent
      .post("/oauth/authorize")
      .type("form")
      .send({ ...authorizeParams(clientId, challenge), decision: "allow", csrf })
      .expect(302);
    expect(new URL(ok.headers.location as string).searchParams.get("code")).toBeTruthy();
  });

  it("el código se canjea una sola vez y el refresh rota", async () => {
    const admin = await createUser("admin");
    const clientId = await registerClient();
    const { verifier, challenge } = pkce();

    const authorize = await request(app)
      .post("/oauth/authorize")
      .type("form")
      .send({ ...authorizeParams(clientId, challenge), decision: "allow", email: admin.email, password: "clave-segura-123" })
      .expect(302);
    const code = new URL(authorize.headers.location as string).searchParams.get("code") as string;

    const exchange = {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
      resource: RESOURCE,
    };
    const [first, second] = await Promise.all([
      request(app).post("/oauth/token").type("form").send(exchange),
      request(app).post("/oauth/token").type("form").send(exchange),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 400]);
    const tokens = (first.status === 200 ? first : second).body as { access_token: string; refresh_token: string };

    const refreshed = await request(app)
      .post("/oauth/token")
      .type("form")
      .send({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId })
      .expect(200);
    expect(refreshed.body.refresh_token).not.toBe(tokens.refresh_token);
    await request(app)
      .post("/oauth/token")
      .type("form")
      .send({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId })
      .expect(400);

    // El access token OAuth sirve para el endpoint MCP.
    const session = await mcpSession(tokens.access_token);
    const summary = await callTool(tokens.access_token, session, "dashboard_summary");
    expect(summary.isError).toBe(false);
  });

  it("sin token, /mcp responde 401 con la pista de metadatos (RFC 9728)", async () => {
    const res = await mcpCall("", "initialize");
    expect(res.status).toBe(401);
    expect(String(res.headers["www-authenticate"])).toContain("resource_metadata");
  });
});

describe("tokens personales en MCP", () => {
  beforeEach(resetDatabase);

  it("un token de solo lectura consulta pero no puede vender", async () => {
    const seller = await createUser("seller");
    const { cable } = await createCatalog();
    const { token } = await createPat(seller.email, ["read"]);
    const session = await mcpSession(token);

    const list = await callTool(token, session, "list_products", { search: "Cable" });
    expect(list.isError).toBe(false);
    expect(list.data.data[0].id).toBe(cable.id);

    const sale = await callTool(token, session, "create_sale", {
      paymentMethod: "cash",
      items: [{ productId: cable.id, quantity: 1 }],
    });
    expect(sale.isError).toBe(true);
    expect(sale.data.error).toMatch(/solo lectura/);
  });

  it("con escritura registra la venta, respeta el rol y deja rastro en la bitácora", async () => {
    const seller = await createUser("seller");
    const { cable, category } = await createCatalog();
    const { token, id } = await createPat(seller.email, ["read", "write"]);
    const session = await mcpSession(token);

    const sale = await callTool(token, session, "create_sale", {
      paymentMethod: "yape",
      items: [{ productId: cable.id, quantity: 2 }],
    });
    expect(sale.isError).toBe(false);
    expect(sale.data.total).toBe("0.20");

    // Un vendedor no edita el catálogo aunque su token tenga `write`.
    const product = await callTool(token, session, "create_product", {
      sku: "Z-1",
      name: "Z",
      categoryId: category.id,
      price: "1.00",
      cost: "0.50",
    });
    expect(product.isError).toBe(true);

    // La bitácora se escribe sin bloquear la respuesta: se espera un instante.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const logs = await db.select().from(mcpAuditLogs).where(eq(mcpAuditLogs.apiTokenId, id));
    expect(logs.map((log) => [log.tool, log.ok])).toEqual(
      expect.arrayContaining([
        ["create_sale", true],
        ["create_product", false],
      ]),
    );
  });

  it("un token revocado deja de funcionar al instante", async () => {
    const admin = await createUser("admin");
    const { token, id, agent } = await createPat(admin.email, ["read"]);
    await mcpSession(token);
    await agent.delete(`/api/tokens/${id}`).expect(200);
    const res = await mcpCall(token, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vitest", version: "0" },
    });
    expect(res.status).toBe(401);
  });

  it("un token no puede crear otros tokens ni usarse para escribir por REST si es de lectura", async () => {
    const admin = await createUser("admin");
    const { token } = await createPat(admin.email, ["read"]);
    await request(app)
      .post("/api/tokens")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "otro", scopes: ["read"] })
      .expect(403);
    await request(app).get("/api/products").set("Authorization", `Bearer ${token}`).expect(200);
    await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Nueva" })
      .expect(403);
  });
});
