import { beforeEach, describe, expect, it } from "vitest";
import { app, createUser, loginAgent, PASSWORD, request, resetDatabase } from "./helpers.js";

describe("auth del panel", () => {
  beforeEach(resetDatabase);

  it("inicia sesión con cookie httpOnly y devuelve el perfil", async () => {
    const admin = await createUser("admin");
    const res = await request(app).post("/api/auth/login").send({ email: admin.email, password: PASSWORD }).expect(200);
    expect(res.body.user.email).toBe(admin.email);
    expect(String(res.headers["set-cookie"])).toMatch(/token=.*HttpOnly/i);

    const agent = await loginAgent(admin.email);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.user.role).toBe("admin");
  });

  it("rechaza credenciales inválidas y usuarios desactivados con el mismo mensaje", async () => {
    const inactive = await createUser("seller", false);
    const a = await request(app).post("/api/auth/login").send({ email: inactive.email, password: PASSWORD });
    const b = await request(app).post("/api/auth/login").send({ email: "nadie@test.dev", password: PASSWORD });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it("bloquea el login tras varios intentos fallidos (solo cuentan los fallidos)", async () => {
    const seller = await createUser("seller");
    // Los éxitos no consumen cupo.
    for (let i = 0; i < 3; i += 1) {
      await request(app).post("/api/auth/login").send({ email: seller.email, password: PASSWORD }).expect(200);
    }
    for (let i = 0; i < 5; i += 1) {
      await request(app).post("/api/auth/login").send({ email: seller.email, password: "incorrecta" }).expect(401);
    }
    await request(app).post("/api/auth/login").send({ email: seller.email, password: PASSWORD }).expect(429);
  });

  it("desactivar a un usuario corta su sesión al instante (el rol se lee de la base)", async () => {
    const admin = await createUser("admin");
    const seller = await createUser("seller");
    const adminAgent = await loginAgent(admin.email);
    const sellerAgent = await loginAgent(seller.email);

    await sellerAgent.get("/api/auth/me").expect(200);
    await adminAgent.patch(`/api/users/${seller.id}`).send({ isActive: false }).expect(200);
    await sellerAgent.get("/api/auth/me").expect(401);
  });

  it("un vendedor no gestiona usuarios y un admin no puede quitarse su propio rol", async () => {
    const admin = await createUser("admin");
    const seller = await createUser("seller");
    const sellerAgent = await loginAgent(seller.email);
    await sellerAgent.get("/api/users").expect(403);

    const adminAgent = await loginAgent(admin.email);
    await adminAgent.patch(`/api/users/${admin.id}`).send({ role: "seller" }).expect(400);
  });

  it("rutas desconocidas responden 404 aunque no haya sesión", async () => {
    await request(app).get("/api/no-existe").expect(404);
  });
});
