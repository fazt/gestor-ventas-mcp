export type DashboardSummary = {
  todayTotal: string;
  todayCount: number;
  monthTotal: string;
  monthCount: number;
  averageTicket: string;
  lowStockCount: number;
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
