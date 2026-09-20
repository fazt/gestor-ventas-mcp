import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { env } from "../../lib/env.js";
import { apiFetch, asToolText, type McpActor } from "./api-client.js";

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
const writeHint = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const idSchema = z
  .number()
  .int()
  .min(1)
  .describe("Identificador numérico del registro");

const pageSchema = z.number().int().min(1).optional().describe("Página (por defecto 1)");
const pageSizeSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe("Tamaño de página (1-100)");

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

async function toolFromApi(actor: McpActor, path: string, init: RequestInit = {}) {
  const result = await apiFetch(actor, path, init);
  const payload = asToolText(result.body);
  if (result.status >= 400) {
    return { ...payload, isError: true as const };
  }
  return payload;
}

function asId(prefix: string, id: number): string {
  return `${prefix}:${id}`;
}

function parsePrefixedId(value: string): { kind: string; id: number } | null {
  const [kind, raw] = value.split(":");
  const id = Number(raw);
  if (!kind || !Number.isInteger(id) || id < 1) {
    return null;
  }
  return { kind, id };
}

export function createGestorMcpServer(actor: McpActor): McpServer {
  const server = new McpServer(
    {
      name: "gestor-ventas",
      version: "1.0.0",
      title: "Gestor de ventas",
      websiteUrl: env.WEB_ORIGIN,
      description:
        "Panel de gestión de ventas: catálogo, punto de venta, inventario y dashboard.",
    },
    {
      instructions:
        "Usa search para encontrar productos, categorías o ventas, y fetch para el detalle (ids tipo product:1, category:2, sale:3). También hay tools específicas: list_products, create_sale, dashboard_summary, etc.",
    },
  );

  server.registerTool(
    "search",
    {
      title: "Buscar en el gestor",
      description:
        "Use this when the user wants to find products, categories or sales. Returns matching records with ids for fetch.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Texto a buscar (nombre, SKU, cliente o código de venta)"),
      }),
      annotations: readOnly,
    },
    async ({ query }) => {
      const [productsRes, categoriesRes, salesRes] = await Promise.all([
        apiFetch(actor, `/api/products${queryString({ search: query, page: 1, pageSize: 10 })}`),
        apiFetch(actor, "/api/categories"),
        apiFetch(actor, `/api/sales${queryString({ page: 1, pageSize: 10 })}`),
      ]);

      const needle = query.toLowerCase();
      const results: Array<{ id: string; title: string; url: string; text: string }> = [];

      const productData = (productsRes.body as { data?: Array<Record<string, unknown>> })?.data ?? [];
      for (const product of productData) {
        results.push({
          id: asId("product", Number(product.id)),
          title: String(product.name ?? "Producto"),
          url: `${env.WEB_ORIGIN}/productos`,
          text: `SKU ${product.sku} · stock ${product.stock} · precio ${product.price}`,
        });
      }

      const categories = (categoriesRes.body as { data?: Array<Record<string, unknown>> })?.data ?? [];
      for (const category of categories) {
        const name = String(category.name ?? "");
        if (!name.toLowerCase().includes(needle) && needle !== "*") {
          continue;
        }
        results.push({
          id: asId("category", Number(category.id)),
          title: name,
          url: `${env.WEB_ORIGIN}/categorias`,
          text: String(category.description ?? "Categoría"),
        });
      }

      const salesData = (salesRes.body as { data?: Array<Record<string, unknown>> })?.data ?? [];
      for (const sale of salesData) {
        const haystack = `${sale.code} ${sale.customerName ?? ""}`.toLowerCase();
        if (!haystack.includes(needle) && needle !== "*") {
          continue;
        }
        results.push({
          id: asId("sale", Number(sale.id)),
          title: String(sale.code ?? "Venta"),
          url: `${env.WEB_ORIGIN}/ventas/${sale.id}`,
          text: `${sale.customerName ?? "Sin cliente"} · ${sale.total} · ${sale.status}`,
        });
      }

      return asToolText({ results });
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Obtener detalle",
      description:
        "Use this after search to load a full record. id must look like product:1, category:2 or sale:3.",
      inputSchema: z.object({
        id: z.string().min(1).describe("Id devuelto por search, por ejemplo product:1"),
      }),
      annotations: readOnly,
    },
    async ({ id }) => {
      const parsed = parsePrefixedId(id);
      if (!parsed) {
        return { ...asToolText({ error: "id inválido; usa product:1, category:2 o sale:3" }), isError: true };
      }
      if (parsed.kind === "product") {
        return toolFromApi(actor, `/api/products/${parsed.id}`);
      }
      if (parsed.kind === "category") {
        return toolFromApi(actor, `/api/categories/${parsed.id}`);
      }
      if (parsed.kind === "sale") {
        return toolFromApi(actor, `/api/sales/${parsed.id}`);
      }
      return { ...asToolText({ error: `tipo no soportado: ${parsed.kind}` }), isError: true };
    },
  );

  server.registerTool(
    "list_products",
    {
      title: "Listar productos",
      description: "Use this when listing the product catalog with optional search and category filter.",
      inputSchema: z.object({
        page: pageSchema,
        pageSize: pageSizeSchema,
        search: z.string().optional().describe("Filtro por nombre o SKU"),
        categoryId: idSchema.optional().describe("Filtrar por categoría"),
      }),
      annotations: readOnly,
    },
    async (input) => toolFromApi(actor, `/api/products${queryString(input)}`),
  );

  server.registerTool(
    "get_product",
    {
      title: "Obtener producto",
      description: "Use this when you already know the product numeric id.",
      inputSchema: z.object({ id: idSchema }),
      annotations: readOnly,
    },
    async ({ id }) => toolFromApi(actor, `/api/products/${id}`),
  );

  server.registerTool(
    "list_categories",
    {
      title: "Listar categorías",
      description: "Use this to list all product categories.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().describe("Máximo de categorías a devolver"),
      }),
      annotations: readOnly,
    },
    async ({ limit }) => {
      const result = await toolFromApi(actor, "/api/categories");
      if (limit && result.content[0]) {
        const parsed = JSON.parse(result.content[0].text) as { data?: unknown[] };
        if (Array.isArray(parsed.data)) {
          return asToolText({ data: parsed.data.slice(0, limit) });
        }
      }
      return result;
    },
  );

  server.registerTool(
    "get_category",
    {
      title: "Obtener categoría",
      description: "Use this when you already know the category numeric id.",
      inputSchema: z.object({ id: idSchema }),
      annotations: readOnly,
    },
    async ({ id }) => toolFromApi(actor, `/api/categories/${id}`),
  );

  server.registerTool(
    "create_category",
    {
      title: "Crear categoría",
      description: "Use this to create a new product category. Do not use for products or sales.",
      inputSchema: z.object({
        name: z.string().min(1).max(255).describe("Nombre único de la categoría"),
        description: z.string().max(1000).optional().describe("Descripción opcional"),
      }),
      annotations: writeHint,
    },
    async (input) =>
      toolFromApi(actor, "/api/categories", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  );

  server.registerTool(
    "list_sales",
    {
      title: "Listar ventas",
      description: "Use this to list sales, optionally filtered by date range and status.",
      inputSchema: z.object({
        page: pageSchema,
        pageSize: pageSizeSchema,
        status: z.enum(["completed", "cancelled"]).optional().describe("Estado de la venta"),
        from: z.string().optional().describe("Fecha inicial YYYY-MM-DD"),
        to: z.string().optional().describe("Fecha final YYYY-MM-DD"),
      }),
      annotations: readOnly,
    },
    async (input) => toolFromApi(actor, `/api/sales${queryString(input)}`),
  );

  server.registerTool(
    "get_sale",
    {
      title: "Obtener venta",
      description: "Use this to get one sale with line items by numeric id.",
      inputSchema: z.object({ id: idSchema }),
      annotations: readOnly,
    },
    async ({ id }) => toolFromApi(actor, `/api/sales/${id}`),
  );

  server.registerTool(
    "create_sale",
    {
      title: "Crear venta",
      description: "Use this to register a sale. Decrements stock. Do not call if stock is unknown; list_products first.",
      inputSchema: z.object({
        customerName: z.string().optional().describe("Nombre del cliente"),
        customerDocument: z.string().optional().describe("Documento del cliente"),
        discount: z.string().optional().describe("Descuento en dinero, por ejemplo 5.00"),
        tax: z.string().optional().describe("Impuesto en dinero, por ejemplo 0.00"),
        paymentMethod: z
          .enum(["cash", "card", "transfer", "yape"])
          .describe("Método de pago"),
        items: z
          .array(
            z.object({
              productId: idSchema.describe("Id del producto"),
              quantity: z.number().int().min(1).describe("Cantidad"),
            }),
          )
          .min(1)
          .describe("Ítems de la venta"),
      }),
      annotations: writeHint,
    },
    async (input) =>
      toolFromApi(actor, "/api/sales", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  );

  server.registerTool(
    "cancel_sale",
    {
      title: "Cancelar venta",
      description: "Use this to cancel a completed sale and restore stock. Destructive.",
      inputSchema: z.object({ id: idSchema }),
      annotations: destructive,
    },
    async ({ id }) => toolFromApi(actor, `/api/sales/${id}/cancel`, { method: "POST" }),
  );

  server.registerTool(
    "list_low_stock",
    {
      title: "Productos con stock bajo",
      description: "Use this to list products at or below min stock.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().describe("Máximo de productos a devolver"),
      }),
      annotations: readOnly,
    },
    async ({ limit }) => {
      const result = await toolFromApi(actor, "/api/inventory/low-stock");
      if (limit && result.content[0]) {
        const parsed = JSON.parse(result.content[0].text) as unknown;
        if (Array.isArray(parsed)) {
          return asToolText(parsed.slice(0, limit));
        }
        if (parsed && typeof parsed === "object" && "data" in parsed && Array.isArray(parsed.data)) {
          return asToolText({ data: parsed.data.slice(0, limit) });
        }
      }
      return result;
    },
  );

  server.registerTool(
    "adjust_stock",
    {
      title: "Ajustar inventario",
      description: "Use this for stock inbound or manual adjustment. Do not use to sell; use create_sale.",
      inputSchema: z.object({
        productId: idSchema.describe("Producto a ajustar"),
        type: z.enum(["in", "adjustment"]).describe("in = ingreso, adjustment = ajuste"),
        quantity: z.number().int().min(1).describe("Cantidad"),
        reason: z.string().min(1).describe("Motivo del movimiento"),
      }),
      annotations: writeHint,
    },
    async (input) =>
      toolFromApi(actor, "/api/inventory/adjust", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  );

  server.registerTool(
    "dashboard_summary",
    {
      title: "Resumen del dashboard",
      description: "Use this for today's and this month's sales metrics and low-stock count.",
      inputSchema: z.object({
        period: z
          .enum(["today", "month"])
          .optional()
          .describe("Enfasis del resumen; la API igual devuelve ambos periodos"),
      }),
      annotations: readOnly,
    },
    async () => toolFromApi(actor, "/api/dashboard/summary"),
  );

  return server;
}
