export type DashboardSummary = {
  todayTotal: string;
  todayCount: number;
  monthTotal: string;
  monthCount: number;
  averageTicket: string;
  lowStockCount: number;
  monthGrossMargin: string;
  monthMarginPercent: number;
  currency: string;
  timezone: string;
};

export type SalesChartPoint = {
  date: string;
  total: string;
  count: number;
};

export type TopProduct = {
  productId: number;
  productName: string;
  quantitySold: number;
  total: string;
};

export type StoreSettings = {
  name: string;
  currency: string;
  timezone: string;
  taxRate: number;
  taxName: string;
};

export type SalesReport = {
  from: string;
  to: string;
  currency: string;
  totals: {
    count: number;
    subtotal: string;
    discount: string;
    tax: string;
    total: string;
    cost: string;
    grossMargin: string;
    averageTicket: string;
  };
  cancelled: { count: number; total: string };
  byPaymentMethod: Array<{ paymentMethod: string; count: number; total: string }>;
  bySeller: Array<{ userId: number; userName: string; count: number; total: string }>;
  byCategory: Array<{ categoryId: number; categoryName: string; quantity: number; total: string }>;
};

export const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  yape: "Yape",
};

export const SALE_STATUS_LABELS: Record<string, string> = {
  completed: "Completada",
  cancelled: "Cancelada",
};

export const MOVEMENT_LABELS: Record<string, string> = {
  in: "Entrada",
  out: "Salida",
  adjustment: "Ajuste",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  seller: "Vendedor",
};

export const TOOL_LABELS: Record<string, string> = {
  search: "Buscar",
  fetch: "Ver detalle",
  list_products: "Listar productos",
  get_product: "Ver producto",
  create_product: "Crear producto",
  update_product: "Editar producto",
  list_categories: "Listar categorías",
  get_category: "Ver categoría",
  create_category: "Crear categoría",
  list_sales: "Listar ventas",
  get_sale: "Ver venta",
  create_sale: "Registrar venta",
  cancel_sale: "Cancelar venta",
  list_low_stock: "Stock bajo",
  list_stock_movements: "Historial de inventario",
  adjust_stock: "Mover inventario",
  dashboard_summary: "Resumen",
  sales_by_day: "Ventas por día",
  top_products: "Más vendidos",
  sales_report: "Reporte por rango",
};
