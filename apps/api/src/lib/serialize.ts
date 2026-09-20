import type {
  Category,
  Product,
  PublicUser,
  Sale,
  SaleItem,
  StockMovement,
} from "@gestor/shared";
import type {
  categories,
  products,
  saleItems,
  sales,
  stockMovements,
  users,
} from "@gestor/db";
import { asMoney } from "./money.js";

type UserRow = typeof users.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type ProductRow = typeof products.$inferSelect;
type SaleRow = typeof sales.$inferSelect;
type SaleItemRow = typeof saleItems.$inferSelect;
type StockMovementRow = typeof stockMovements.$inferSelect;

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
  };
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

export function toSale(row: SaleRow): Sale {
  return {
    id: row.id,
    code: row.code,
    userId: row.userId,
    customerName: row.customerName,
    customerDocument: row.customerDocument,
    subtotal: asMoney(row.subtotal),
    discount: asMoney(row.discount),
    tax: asMoney(row.tax),
    total: asMoney(row.total),
    paymentMethod: row.paymentMethod,
    status: row.status,
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

export function toStockMovement(row: StockMovementRow): StockMovement {
  return {
    id: row.id,
    productId: row.productId,
    type: row.type,
    quantity: row.quantity,
    previousStock: row.previousStock,
    newStock: row.newStock,
    reason: row.reason,
    saleId: row.saleId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}
