import { McpServer } from "@modelcontextprotocol/server";
import {
  adjustStockSchema,
  cancelSaleSchema,
  createCategorySchema,
  createProductSchema,
  createSaleSchema,
  productListQuerySchema,
  saleListQuerySchema,
  stockMovementListQuerySchema,
  updateProductSchema,
} from "@gestor/shared";
import { z, ZodError } from "zod";
import { env } from "../../lib/env.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { createCategory, getCategory, listCategories } from "../categories/categories.service.js";
import { getReport, getSalesChart, getSummary, getTopProducts } from "../dashboard/dashboard.service.js";
import { adjustStock, listLowStock, listMovements } from "../inventory/inventory.service.js";
import { createProduct, getProduct, listProducts, updateProduct } from "../products/products.service.js";
import { cancelSale, createSale, getSale, listSales } from "../sales/sales.service.js";
import { accessDenied, type McpActor, type ToolAccess } from "./actor.js";
import { recordToolCall } from "./audit.js";

const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
const writeHint = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const idSchema = z.number().int().min(1).describe("Identificador numérico del registro");
const pageSchema = z.number().int().min(1).optional().describe("Página (por defecto 1)");
const pageSizeSchema = z.number().int().min(1).max(100).optional().describe("Tamaño de página (1-100, por defecto 20)");
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe(`Fecha YYYY-MM-DD en la zona horaria de la tienda (${env.STORE_TIMEZONE})`);
const moneyText = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).describe("Monto con punto decimal, por ejemplo 5.00");

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function asText(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message: string, details?: unknown): ToolResult {
  return { ...asText(details === undefined ? { error: message } : { error: message, details }), isError: true };
}

function webUrl(path: string): string {
  const origin = env.WEB_ORIGINS[0] ?? env.PUBLIC_URL;
  return `${origin}${path}`;
}

function parsePrefixedId(value: string): { kind: string; id: number } | null {
  const [kind, raw] = value.split(":");
  const id = Number(raw);
  if (!kind || !Number.isInteger(id) || id < 1) {
    return null;
  }
  return { kind, id };
}

/** Quita claves `undefined` (los esquemas de query esperan ausencia, no undefined explícito). */
function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function createGestorMcpServer(actor: McpActor): McpServer {
  const server = new McpServer(
    {
      name: "gestor-ventas",
      version: "2.0.0",
      title: env.STORE_NAME,
      websiteUrl: env.WEB_ORIGINS[0] ?? env.PUBLIC_URL,
      description: "Gestor de ventas: catálogo, punto de venta, inventario y métricas del negocio.",
    },
    {
      instructions: [
        `Servidor del gestor de ventas de "${env.STORE_NAME}". Moneda ${env.STORE_CURRENCY}; las fechas se interpretan en ${env.STORE_TIMEZONE}.`,
        "Usa search para encontrar productos, categorías o ventas y fetch para el detalle (ids tipo product:1, category:2, sale:3).",
        "Antes de create_sale consulta el stock con list_products o get_product. Los montos viajan como texto con 2 decimales.",
        "Las tools de escritura requieren un token con permiso `write`; editar el catálogo requiere rol administrador.",
      ].join(" "),
    },
  );

  /** Ejecuta una tool con control de permisos, manejo de errores y bitácora. */
  async function run(tool: string, args: unknown, access: ToolAccess, fn: () => Promise<unknown>): Promise<ToolResult> {
    const started = performance.now();
    const denied = accessDenied(actor, access);
    if (denied) {
      recordToolCall({ actor, tool, args, ok: false, error: denied, durationMs: performance.now() - started });
      return errorResult(denied);
    }
    try {
      const payload = await fn();
      recordToolCall({ actor, tool, args, ok: true, durationMs: performance.now() - started });
      return asText(payload);
    } catch (error) {
      let result: ToolResult;
      let message: string;
      if (error instanceof AppError) {
        message = error.message;
        result = errorResult(error.message, error.details);
      } else if (error instanceof ZodError) {
        message = "Argumentos inválidos";
        result = errorResult(
          message,
          error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        );
      } else {
        message = "Error interno";
        logger.error({ err: error, tool }, "Fallo en tool MCP");
        result = errorResult("Error interno del servidor");
      }
      recordToolCall({ actor, tool, args, ok: false, error: message, durationMs: performance.now() - started });
      return result;
    }
  }

  // ---------- Búsqueda genérica (ChatGPT / deep research usan search + fetch) ----------

  server.registerTool(
    "search",
    {
      title: "Buscar en el gestor",
      description:
        "Use this when the user wants to find products, categories or sales by name, SKU, sale code, customer name or document. Returns ids for fetch.",
      inputSchema: z.object({
        query: z.string().min(1).max(100).describe("Texto a buscar (nombre, SKU, cliente, documento o código de venta)"),
      }),
      annotations: readOnly,
    },
    async ({ query }) =>
      run("search", { query }, "read", async () => {
        const [productsPage, categoriesList, salesPage] = await Promise.all([
          listProducts(productListQuerySchema.parse({ search: query, page: 1, pageSize: 10 })),
          listCategories(),
          listSales(saleListQuerySchema.parse({ search: query, page: 1, pageSize: 10 })),
        ]);
        const needle = query.toLowerCase();
        const results: Array<{ id: string; title: string; url: string; text: string }> = [];

        for (const product of productsPage.data) {
          results.push({
            id: `product:${product.id}`,
            title: product.name,
            url: webUrl(`/productos?buscar=${encodeURIComponent(product.sku)}`),
            text: `SKU ${product.sku} · stock ${product.stock} (mín. ${product.minStock}) · precio ${product.price} ${env.STORE_CURRENCY}${product.isActive ? "" : " · INACTIVO"}`,
          });
        }
        for (const category of categoriesList.data) {
          if (!category.name.toLowerCase().includes(needle)) continue;
          results.push({
            id: `category:${category.id}`,
            title: category.name,
            url: webUrl("/categorias"),
            text: category.description ?? "Categoría",
          });
        }
        for (const sale of salesPage.data) {
          results.push({
            id: `sale:${sale.id}`,
            title: sale.code,
            url: webUrl(`/ventas/${sale.id}`),
            text: `${sale.customerName ?? "Sin cliente"} · ${sale.total} ${env.STORE_CURRENCY} · ${sale.status} · ${sale.createdAt}`,
          });
        }
        return { results };
      }),
  );

  server.registerTool(
    "fetch",
    {
      title: "Obtener detalle",
      description: "Use this after search to load a full record. id must look like product:1, category:2 or sale:3.",
      inputSchema: z.object({
        id: z.string().min(3).max(40).describe("Id devuelto por search, por ejemplo product:1"),
      }),
      annotations: readOnly,
    },
    async ({ id }) =>
      run("fetch", { id }, "read", async () => {
        const parsed = parsePrefixedId(id);
        if (!parsed) throw new AppError(400, "id inválido; usa product:1, category:2 o sale:3");
        if (parsed.kind === "product") {
          const product = await getProduct(parsed.id);
          return { id, title: product.name, url: webUrl("/productos"), text: product.description ?? "", metadata: product };
        }
        if (parsed.kind === "category") {
          const category = await getCategory(parsed.id);
          return { id, title: category.name, url: webUrl("/categorias"), text: category.description ?? "", metadata: category };
        }
        if (parsed.kind === "sale") {
          const sale = await getSale(parsed.id);
          const lines = sale.items.map((item) => `${item.quantity} x ${item.productName} = ${item.subtotal}`).join("\n");
          return { id, title: sale.code, url: webUrl(`/ventas/${sale.id}`), text: lines, metadata: sale };
        }
        throw new AppError(400, `Tipo no soportado: ${parsed.kind}`);
      }),
  );

  // ---------- Catálogo ----------

  server.registerTool(
    "list_products",
    {
      title: "Listar productos",
      description: "Use this to list the product catalog with optional text search, category, active and low-stock filters.",
      inputSchema: z.object({
        page: pageSchema,
        pageSize: pageSizeSchema,
        search: z.string().max(100).optional().describe("Filtro por nombre o SKU"),
        categoryId: idSchema.optional().describe("Filtrar por categoría"),
        onlyActive: z.boolean().optional().describe("true = solo activos"),
        lowStock: z.boolean().optional().describe("true = solo productos en o bajo el stock mínimo"),
      }),
      annotations: readOnly,
    },
    async (input) =>
      run("list_products", input, "read", () =>
        listProducts(
          productListQuerySchema.parse(
            compact({
              page: input.page,
              pageSize: input.pageSize,
              search: input.search,
              categoryId: input.categoryId,
              isActive: input.onlyActive ? "true" : undefined,
              lowStock: input.lowStock ? "true" : undefined,
            }),
          ),
        ),
      ),
  );

  server.registerTool(
    "get_product",
    {
      title: "Obtener producto",
      description: "Use this when you already know the product numeric id.",
      inputSchema: z.object({ id: idSchema }),
      annotations: readOnly,
    },
    async ({ id }) => run("get_product", { id }, "read", () => getProduct(id)),
  );

  server.registerTool(
    "create_product",
    {
      title: "Crear producto",
      description: "Use this to add a new product to the catalog (admin only). Initial stock is recorded as an inbound movement.",
      inputSchema: z.object({
        sku: z.string().min(1).max(64).describe("Código único"),
        name: z.string().min(1).max(255).describe("Nombre"),
        description: z.string().max(2000).optional(),
        categoryId: idSchema.describe("Categoría (usa list_categories)"),
        price: moneyText.describe("Precio de venta"),
        cost: moneyText.describe("Costo unitario"),
        stock: z.number().int().min(0).optional().describe("Stock inicial (por defecto 0)"),
        minStock: z.number().int().min(0).optional().describe("Stock mínimo para alertas"),
      }),
      annotations: writeHint,
    },
    async (input) => run("create_product", input, "admin", () => createProduct(createProductSchema.parse(input), actor.id)),
  );

  server.registerTool(
    "update_product",
    {
      title: "Actualizar producto",
      description:
        "Use this to change price, cost, name, minimum stock or active state of a product (admin only). Only the fields you send change. For stock changes prefer adjust_stock.",
      inputSchema: z.object({
        id: idSchema,
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(2000).optional(),
        categoryId: idSchema.optional(),
        price: moneyText.optional(),
        cost: moneyText.optional(),
        minStock: z.number().int().min(0).optional(),
        isActive: z.boolean().optional().describe("false = dar de baja"),
      }),
      annotations: writeHint,
    },
    async ({ id, ...changes }) =>
      run("update_product", { id, ...changes }, "admin", () =>
        updateProduct(id, updateProductSchema.parse(compact(changes)), actor.id),
      ),
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
    async ({ limit }) =>
      run("list_categories", { limit }, "read", async () => {
        const result = await listCategories();
        return limit ? { data: result.data.slice(0, limit) } : result;
      }),
  );

  server.registerTool(
    "get_category",
    {
      title: "Obtener categoría",
      description: "Use this when you already know the category numeric id.",
      inputSchema: z.object({ id: idSchema }),
      annotations: readOnly,
    },
    async ({ id }) => run("get_category", { id }, "read", () => getCategory(id)),
  );

  server.registerTool(
    "create_category",
    {
      title: "Crear categoría",
      description: "Use this to create a new product category (admin only). Do not use for products or sales.",
      inputSchema: z.object({
        name: z.string().min(1).max(255).describe("Nombre único de la categoría"),
        description: z.string().max(1000).optional().describe("Descripción opcional"),
      }),
      annotations: writeHint,
    },
    async (input) => run("create_category", input, "admin", () => createCategory(createCategorySchema.parse(input))),
  );

  // ---------- Ventas ----------

  server.registerTool(
    "list_sales",
    {
      title: "Listar ventas",
      description: "Use this to list sales filtered by date range, status, payment method or text (code, customer, document).",
      inputSchema: z.object({
        page: pageSchema,
        pageSize: pageSizeSchema,
        status: z.enum(["completed", "cancelled"]).optional().describe("Estado de la venta"),
        paymentMethod: z.enum(["cash", "card", "transfer", "yape"]).optional(),
        from: dateSchema.optional().describe("Fecha inicial (inclusive)"),
        to: dateSchema.optional().describe("Fecha final (inclusive)"),
        search: z.string().max(100).optional().describe("Código de venta, cliente o documento"),
      }),
      annotations: readOnly,
    },
    async (input) => run("list_sales", input, "read", () => listSales(saleListQuerySchema.parse(compact(input)))),
  );

  server.registerTool(
    "get_sale",
    {
      title: "Obtener venta",
      description: "Use this to get one sale with its line items by numeric id.",
      inputSchema: z.object({ id: idSchema }),
      annotations: readOnly,
    },
    async ({ id }) => run("get_sale", { id }, "read", () => getSale(id)),
  );

  server.registerTool(
    "create_sale",
    {
      title: "Registrar venta",
      description:
        "Use this to register a sale at current catalog prices. Decrements stock atomically and fails with the shortage detail if stock is insufficient. Check stock first with list_products or get_product.",
      inputSchema: z.object({
        customerName: z.string().max(255).optional().describe("Nombre del cliente"),
        customerDocument: z.string().max(64).optional().describe("DNI/RUC u otro documento"),
        discount: moneyText.optional().describe("Descuento total en dinero, por ejemplo 5.00"),
        tax: moneyText
          .optional()
          .describe(
            env.STORE_TAX_RATE > 0
              ? `Impuesto en dinero; si se omite se aplica ${env.STORE_TAX_NAME} ${env.STORE_TAX_RATE}%`
              : "Impuesto en dinero (por defecto 0)",
          ),
        paymentMethod: z.enum(["cash", "card", "transfer", "yape"]).describe("Método de pago"),
        items: z
          .array(
            z.object({
              productId: idSchema.describe("Id del producto"),
              quantity: z.number().int().min(1).describe("Cantidad"),
            }),
          )
          .min(1)
          .max(100)
          .describe("Ítems de la venta"),
      }),
      annotations: writeHint,
    },
    async (input) => run("create_sale", input, "write", () => createSale(actor.id, createSaleSchema.parse(compact(input)))),
  );

  server.registerTool(
    "cancel_sale",
    {
      title: "Cancelar venta",
      description:
        "Use this to cancel a completed sale and restore its stock. Sellers can only cancel their own sales of the same day. Destructive: confirm with the user first.",
      inputSchema: z.object({
        id: idSchema,
        reason: z.string().min(3).max(500).optional().describe("Motivo de la cancelación"),
      }),
      annotations: destructive,
    },
    async ({ id, reason }) =>
      run("cancel_sale", { id, reason }, "write", () =>
        cancelSale(id, actor, cancelSaleSchema.parse(compact({ reason })).reason),
      ),
  );

  // ---------- Inventario ----------

  server.registerTool(
    "list_low_stock",
    {
      title: "Productos con stock bajo",
      description: "Use this to list active products at or below their minimum stock (reorder list).",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().describe("Máximo de productos a devolver"),
      }),
      annotations: readOnly,
    },
    async ({ limit }) => run("list_low_stock", { limit }, "read", () => listLowStock(limit ?? 200)),
  );

  server.registerTool(
    "list_stock_movements",
    {
      title: "Historial de inventario",
      description: "Use this to see the stock movement history (kardex), optionally for one product or movement type.",
      inputSchema: z.object({
        page: pageSchema,
        pageSize: pageSizeSchema,
        productId: idSchema.optional(),
        type: z.enum(["in", "out", "adjustment"]).optional(),
      }),
      annotations: readOnly,
    },
    async (input) =>
      run("list_stock_movements", input, "read", () => listMovements(stockMovementListQuerySchema.parse(compact(input)))),
  );

  server.registerTool(
    "adjust_stock",
    {
      title: "Movimiento de inventario",
      description:
        "Use this for inbound goods (in), manual removals like breakage or returns to supplier (out), or a physical count that sets the stock (adjustment). Do not use to sell; use create_sale.",
      inputSchema: z.object({
        productId: idSchema.describe("Producto"),
        type: z.enum(["in", "out", "adjustment"]).describe("in = ingreso, out = salida manual, adjustment = conteo físico"),
        quantity: z.number().int().min(0).describe("Cantidad (in/out) o stock final contado (adjustment)"),
        reason: z.string().min(3).max(500).describe("Motivo del movimiento"),
      }),
      annotations: writeHint,
    },
    async (input) => run("adjust_stock", input, "write", () => adjustStock(actor.id, adjustStockSchema.parse(input))),
  );

  // ---------- Métricas ----------

  server.registerTool(
    "dashboard_summary",
    {
      title: "Resumen del negocio",
      description: "Use this for today's and this month's sales, average ticket, gross margin and low-stock count.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => run("dashboard_summary", {}, "read", () => getSummary()),
  );

  server.registerTool(
    "sales_by_day",
    {
      title: "Ventas por día",
      description: "Use this for a daily sales series (totals and ticket count) for the last N days, including days with no sales.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).optional().describe("Días hacia atrás (por defecto 30)"),
      }),
      annotations: readOnly,
    },
    async ({ days }) => run("sales_by_day", { days }, "read", () => getSalesChart(days ?? 30)),
  );

  server.registerTool(
    "top_products",
    {
      title: "Productos más vendidos",
      description: "Use this to rank best-selling products by units, optionally limited to the last N days.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional().describe("Cuántos productos (por defecto 10)"),
        days: z.number().int().min(1).max(365).optional().describe("Solo los últimos N días"),
      }),
      annotations: readOnly,
    },
    async ({ limit, days }) => run("top_products", { limit, days }, "read", () => getTopProducts(limit ?? 10, days)),
  );

  server.registerTool(
    "sales_report",
    {
      title: "Reporte de ventas por rango",
      description:
        "Use this for a sales report between two dates: totals, discounts, taxes, gross margin, cancellations and breakdown by payment method, seller and category.",
      inputSchema: z.object({
        from: dateSchema.describe("Desde (inclusive)"),
        to: dateSchema.describe("Hasta (inclusive)"),
      }),
      annotations: readOnly,
    },
    async ({ from, to }) => run("sales_report", { from, to }, "read", () => getReport(from, to)),
  );

  return server;
}
