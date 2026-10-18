import { describe, expect, it } from "vitest";
import { csvCell } from "../src/lib/csv.js";
import { asMoney, fromCents, toCents } from "../src/lib/money.js";
import { sanitizeArgs } from "../src/modules/mcp/audit.js";
import { isAllowedRedirectUri } from "../src/modules/oauth/oauth.service.js";
import { computeTaxCents, nextSaleCode } from "../src/modules/sales/sales.service.js";

describe("dinero en centavos", () => {
  it("convierte sin errores de coma flotante", () => {
    expect(toCents("0.10") * 3).toBe(30);
    expect(toCents("129.9")).toBe(12990);
    expect(fromCents(toCents("0.1") + toCents("0.2"))).toBe("0.30");
    expect(asMoney("15.5")).toBe("15.50");
    expect(fromCents(-250)).toBe("-2.50");
  });

  it("calcula el impuesto configurado redondeando al centavo", () => {
    expect(computeTaxCents(10000, 18)).toBe(1800);
    expect(computeTaxCents(999, 18)).toBe(180);
    expect(computeTaxCents(10000, 0)).toBe(0);
  });
});

describe("numeración de ventas", () => {
  it("continúa la secuencia e ignora códigos inválidos", () => {
    expect(nextSaleCode(undefined)).toBe("V-000001");
    expect(nextSaleCode("V-000041")).toBe("V-000042");
    expect(nextSaleCode("V-abc")).toBe("V-000001");
  });
});

describe("CSV", () => {
  it("neutraliza fórmulas y escapa comillas", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell('Dice "hola", sí')).toBe('"Dice ""hola"", sí"');
  });
});

describe("redirect_uri OAuth", () => {
  it("acepta https, loopback http y esquemas nativos", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:33418/callback")).toBe(true);
    expect(isAllowedRedirectUri("cursor://anysphere.cursor-retrieval/oauth/callback")).toBe(true);
  });

  it("rechaza http remoto, esquemas peligrosos y fragmentos", () => {
    expect(isAllowedRedirectUri("http://evil.example.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("data:text/html,hi")).toBe(false);
    expect(isAllowedRedirectUri("https://ok.example.com/cb#frag")).toBe(false);
  });
});

describe("bitácora MCP", () => {
  it("oculta secretos y recorta textos largos", () => {
    const out = sanitizeArgs({ password: "x", nested: { apiToken: "y" }, note: "a".repeat(500) }) as Record<
      string,
      unknown
    >;
    expect(out.password).toBe("[oculto]");
    expect((out.nested as Record<string, unknown>).apiToken).toBe("[oculto]");
    expect(String(out.note).length).toBeLessThanOrEqual(201);
  });
});
