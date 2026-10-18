import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "seller"]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "card",
  "transfer",
  "yape",
]);
export const saleStatusEnum = pgEnum("sale_status", ["completed", "cancelled"]);
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "in",
  "out",
  "adjustment",
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("seller"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    sku: varchar("sku", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    cost: numeric("cost", { precision: 12, scale: 2 }).notNull(),
    stock: integer("stock").notNull().default(0),
    minStock: integer("min_stock").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_category_id_idx").on(t.categoryId),
    check("products_stock_non_negative", sql`${t.stock} >= 0`),
    check("products_min_stock_non_negative", sql`${t.minStock} >= 0`),
    check("products_price_non_negative", sql`${t.price} >= 0 AND ${t.cost} >= 0`),
  ],
);

export const sales = pgTable(
  "sales",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    customerName: varchar("customer_name", { length: 255 }),
    customerDocument: varchar("customer_document", { length: 64 }),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
    tax: numeric("tax", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    status: saleStatusEnum("status").notNull().default("completed"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: integer("cancelled_by").references(() => users.id),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sales_created_at_idx").on(t.createdAt),
    index("sales_status_created_at_idx").on(t.status, t.createdAt),
    index("sales_user_id_idx").on(t.userId),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: serial("id").primaryKey(),
    saleId: integer("sale_id")
      .notNull()
      .references(() => sales.id),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    productName: varchar("product_name", { length: 255 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    /** Costo unitario congelado al vender: permite calcular el margen aunque el costo cambie. */
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull().default("0"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [
    index("sale_items_sale_id_idx").on(t.saleId),
    index("sale_items_product_id_idx").on(t.productId),
    check("sale_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

export const oauthClients = pgTable("oauth_clients", {
  clientId: varchar("client_id", { length: 64 }).primaryKey(),
  clientSecretHash: varchar("client_secret_hash", { length: 255 }),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  tokenEndpointAuthMethod: varchar("token_endpoint_auth_method", { length: 64 })
    .notNull()
    .default("none"),
  clientName: varchar("client_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  codeHash: varchar("code_hash", { length: 64 }).primaryKey(),
  clientId: varchar("client_id", { length: 64 })
    .notNull()
    .references(() => oauthClients.clientId),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: varchar("code_challenge", { length: 128 }).notNull(),
  codeChallengeMethod: varchar("code_challenge_method", { length: 16 }).notNull().default("S256"),
  resource: text("resource").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    clientId: varchar("client_id", { length: 64 })
      .notNull()
      .references(() => oauthClients.clientId),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    resource: text("resource").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("oauth_refresh_tokens_user_client_idx").on(t.userId, t.clientId)],
);

/**
 * Tokens personales (PAT) para conectar Claude Code, Claude Desktop, Cursor o scripts
 * sin pasar por OAuth. Solo se guarda el SHA-256; el token en claro se muestra una vez.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 100 }).notNull(),
    tokenPrefix: varchar("token_prefix", { length: 16 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default(sql`'["read"]'::jsonb`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_tokens_user_id_idx").on(t.userId)],
);

/** Bitácora de cada llamada a una tool MCP: quién, desde qué cliente, qué tool y si falló. */
export const mcpAuditLogs = pgTable(
  "mcp_audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    authKind: varchar("auth_kind", { length: 16 }).notNull(),
    clientId: varchar("client_id", { length: 64 }),
    apiTokenId: integer("api_token_id").references(() => apiTokens.id),
    tool: varchar("tool", { length: 64 }).notNull(),
    ok: boolean("ok").notNull(),
    error: text("error"),
    durationMs: integer("duration_ms").notNull().default(0),
    args: jsonb("args"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mcp_audit_logs_created_at_idx").on(t.createdAt),
    index("mcp_audit_logs_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    type: stockMovementTypeEnum("type").notNull(),
    quantity: integer("quantity").notNull(),
    previousStock: integer("previous_stock").notNull(),
    newStock: integer("new_stock").notNull(),
    reason: text("reason"),
    saleId: integer("sale_id").references(() => sales.id),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_product_id_created_at_idx").on(t.productId, t.createdAt),
    index("stock_movements_sale_id_idx").on(t.saleId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sales: many(sales),
  stockMovements: many(stockMovements),
  apiTokens: many(apiTokens),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  saleItems: many(saleItems),
  stockMovements: many(stockMovements),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  user: one(users, {
    fields: [sales.userId],
    references: [users.id],
  }),
  items: many(saleItems),
  stockMovements: many(stockMovements),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id],
  }),
  sale: one(sales, {
    fields: [stockMovements.saleId],
    references: [sales.id],
  }),
  user: one(users, {
    fields: [stockMovements.userId],
    references: [users.id],
  }),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  user: one(users, {
    fields: [apiTokens.userId],
    references: [users.id],
  }),
}));
