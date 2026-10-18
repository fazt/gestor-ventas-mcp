import type {
  apiTokens,
  categories,
  products,
  saleItems,
  sales,
  stockMovements,
  users,
} from "@gestor/db";
import type {
  ApiToken,
  ApiTokenScope,
  Category,
  Product,
  PublicUser,
  Sale,
  SaleItem,
  StockMovement,
  User,
} from "@gestor/shared";
import { asMoney } from "./money.js";

type UserRow = typeof users.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type ProductRow = typeof products.$inferSelect;
type SaleRow = typeof sales.$inferSelect;
type SaleItemRow = typeof saleItems.$inferSelect;
type StockMovementRow = typeof stockMovements.$inferSelect;
type ApiTokenRow = typeof apiTokens.$inferSelect;

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
  };
}

export function toUser(row: UserRow): User {
  return { ...toPublicUser(row), createdAt: row.createdAt.toISOString() };
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    categoryId: row.categoryId,
    price: asMoney(row.price),
    cost: asMoney(row.cost),
    stock: row.stock,
    minStock: row.minStock,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSale(row: SaleRow, sellerName: string | null = null): Sale {
  return {
    id: row.id,
    code: row.code,
    userId: row.userId,
    sellerName,
    customerName: row.customerName,
    customerDocument: row.customerDocument,
    subtotal: asMoney(row.subtotal),
    discount: asMoney(row.discount),
    tax: asMoney(row.tax),
    total: asMoney(row.total),
    paymentMethod: row.paymentMethod,
    status: row.status,
    cancelledAt: iso(row.cancelledAt),
    cancelledBy: row.cancelledBy,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toSaleItem(row: SaleItemRow): SaleItem {
  return {
    id: row.id,
    saleId: row.saleId,
    productId: row.productId,
    productName: row.productName,
    quantity: row.quantity,
    unitPrice: asMoney(row.unitPrice),
    subtotal: asMoney(row.subtotal),
  };
}

export function toStockMovement(
  row: StockMovementRow,
  extra: { productName?: string | null; productSku?: string | null; userName?: string | null } = {},
): StockMovement {
  return {
    id: row.id,
    productId: row.productId,
    productName: extra.productName ?? null,
    productSku: extra.productSku ?? null,
    type: row.type,
    quantity: row.quantity,
    previousStock: row.previousStock,
    newStock: row.newStock,
    reason: row.reason,
    saleId: row.saleId,
    userId: row.userId,
    userName: extra.userName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toApiToken(row: ApiTokenRow): ApiToken {
  const scopes = (Array.isArray(row.scopes) ? row.scopes : []).filter(
    (scope): scope is ApiTokenScope => scope === "read" || scope === "write",
  );
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes,
    lastUsedAt: iso(row.lastUsedAt),
    expiresAt: iso(row.expiresAt),
    revokedAt: iso(row.revokedAt),
    createdAt: row.createdAt.toISOString(),
  };
}
