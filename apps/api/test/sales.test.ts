import { products, sales, stockMovements } from "@gestor/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createCatalog, createUser, db, loginAgent, resetDatabase } from "./helpers.js";

describe("catálogo", () => {
  beforeEach(resetDatabase);

  it("editar solo el precio no resetea stock ni mínimo (PUT/PATCH parcial)", async () => {
    const admin = await createUser("admin");
    const { cable } = await createCatalog();
    const agent = await loginAgent(admin.email);

    const res = await agent.put(`/api/products/${cable.id}`).send({ price: "0.20" }).expect(200);
    expect(res.body.price).toBe("0.20");
    expect(res.body.stock).toBe(10);
    expect(res.body.minStock).toBe(2);
  });

  it("cambiar el stock desde la edición deja un movimiento de ajuste", async () => {
    const admin = await createUser("admin");
    const { cable } = await createCatalog();
    const agent = await loginAgent(admin.email);

    await agent.patch(`/api/products/${cable.id}`).send({ stock: 4 }).expect(200);
    const movements = await db.select().from(stockMovements).where(eq(stockMovements.productId, cable.id));
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "adjustment", previousStock: 10, newStock: 4, quantity: 6 });
  });

  it("un vendedor no puede crear ni editar catálogo", async () => {
    const seller = await createUser("seller");
    const { category, cable } = await createCatalog();
    const agent = await loginAgent(seller.email);

    await agent.post("/api/categories").send({ name: "Nueva" }).expect(403);
    await agent
      .post("/api/products")
      .send({ sku: "X-1", name: "X", categoryId: category.id, price: "1.00", cost: "0.50" })
      .expect(403);
    await agent.patch(`/api/products/${cable.id}`).send({ price: "9.99" }).expect(403);
  });

  it("el filtro isActive=false devuelve los inactivos (antes devolvía los activos)", async () => {
    const admin = await createUser("admin");
    const { mouse } = await createCatalog();
    const agent = await loginAgent(admin.email);
    await agent.delete(`/api/products/${mouse.id}`).expect(200);

    const res = await agent.get("/api/products?isActive=false").expect(200);
    expect(res.body.data.map((p: { id: number }) => p.id)).toEqual([mouse.id]);
  });
});

describe("ventas", () => {
  beforeEach(resetDatabase);

  it("registra la venta en centavos exactos y descuenta stock con movimiento", async () => {
    const seller = await createUser("seller");
    const { cable } = await createCatalog();
    const agent = await loginAgent(seller.email);

    const res = await agent
      .post("/api/sales")
      .send({ paymentMethod: "cash", items: [{ productId: cable.id, quantity: 2 }, { productId: cable.id, quantity: 1 }] })
      .expect(201);
    expect(res.body.code).toBe("V-000001");
    expect(res.body.subtotal).toBe("0.30");
    expect(res.body.total).toBe("0.30");
    expect(res.body.items).toHaveLength(1);

    const [after] = await db.select().from(products).where(eq(products.id, cable.id));
    expect(after?.stock).toBe(7);
  });

  it("responde 409 con el detalle de faltantes si no hay stock", async () => {
    const seller = await createUser("seller");
    const { mouse } = await createCatalog();
    const agent = await loginAgent(seller.email);

    const res = await agent
      .post("/api/sales")
      .send({ paymentMethod: "card", items: [{ productId: mouse.id, quantity: 3 }] })
      .expect(409);
    expect(res.body.details.shortages[0]).toMatchObject({ productId: mouse.id, requested: 3, available: 1 });
  });

  it("dos ventas simultáneas por la última unidad: solo una gana y el stock no queda negativo", async () => {
    const seller = await createUser("seller");
    const { mouse } = await createCatalog();
    const a = await loginAgent(seller.email);
    const b = await loginAgent(seller.email);

    const body = { paymentMethod: "cash", items: [{ productId: mouse.id, quantity: 1 }] };
    const results = await Promise.all([a.post("/api/sales").send(body), b.post("/api/sales").send(body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);

    const [after] = await db.select().from(products).where(eq(products.id, mouse.id));
    expect(after?.stock).toBe(0);
  });

  it("cancelar repone el stock una sola vez y guarda quién y por qué", async () => {
    const admin = await createUser("admin");
    const { cable } = await createCatalog();
    const agent = await loginAgent(admin.email);

    const sale = await agent
      .post("/api/sales")
      .send({ paymentMethod: "yape", items: [{ productId: cable.id, quantity: 4 }] })
      .expect(201);
    const cancelled = await agent
      .post(`/api/sales/${sale.body.id}/cancel`)
      .send({ reason: "Cliente desistió" })
      .expect(200);
    expect(cancelled.body).toMatchObject({ status: "cancelled", cancelledBy: admin.id, cancelReason: "Cliente desistió" });
    await agent.post(`/api/sales/${sale.body.id}/cancel`).expect(409);

    const [after] = await db.select().from(products).where(eq(products.id, cable.id));
    expect(after?.stock).toBe(10);
  });

  it("un vendedor no cancela ventas ajenas ni de días anteriores", async () => {
    const admin = await createUser("admin");
    const seller = await createUser("seller");
    const { cable } = await createCatalog();
    const adminAgent = await loginAgent(admin.email);
    const sellerAgent = await loginAgent(seller.email);

    const adminSale = await adminAgent
      .post("/api/sales")
      .send({ paymentMethod: "cash", items: [{ productId: cable.id, quantity: 1 }] })
      .expect(201);
    await sellerAgent.post(`/api/sales/${adminSale.body.id}/cancel`).expect(403);

    const ownSale = await sellerAgent
      .post("/api/sales")
      .send({ paymentMethod: "cash", items: [{ productId: cable.id, quantity: 1 }] })
      .expect(201);
    await db
      .update(sales)
      .set({ createdAt: new Date(Date.now() - 3 * 86_400_000) })
      .where(eq(sales.id, ownSale.body.id));
    await sellerAgent.post(`/api/sales/${ownSale.body.id}/cancel`).expect(403);
  });

  it("filtra por fecha en la zona de la tienda (America/Lima, UTC-5)", async () => {
    const admin = await createUser("admin");
    const { cable } = await createCatalog();
    const agent = await loginAgent(admin.email);
    const sale = await agent
      .post("/api/sales")
      .send({ paymentMethod: "cash", items: [{ productId: cable.id, quantity: 1 }] })
      .expect(201);
    // 2026-01-31 03:00 UTC = 2026-01-30 22:00 en Lima.
    await db.update(sales).set({ createdAt: new Date("2026-01-31T03:00:00Z") }).where(eq(sales.id, sale.body.id));

    const onThe30 = await agent.get("/api/sales?from=2026-01-30&to=2026-01-30").expect(200);
    const onThe31 = await agent.get("/api/sales?from=2026-01-31&to=2026-01-31").expect(200);
    expect(onThe30.body.total).toBe(1);
    expect(onThe31.body.total).toBe(0);
  });

  it("busca por código y exporta CSV sin fórmulas ejecutables", async () => {
    const admin = await createUser("admin");
    const { formula } = await createCatalog();
    const agent = await loginAgent(admin.email);
    await agent
      .post("/api/sales")
      .send({ paymentMethod: "transfer", customerName: "=cmd|' /C calc'!A0", items: [{ productId: formula.id, quantity: 1 }] })
      .expect(201);

    const found = await agent.get("/api/sales?search=V-000001").expect(200);
    expect(found.body.total).toBe(1);

    const csv = await agent.get("/api/sales/export.csv").expect(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text).toContain("'=cmd");
    expect(csv.text).not.toMatch(/,=cmd/);
  });
});
