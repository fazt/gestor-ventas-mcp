export const queryKeys = {
  me: ["me"] as const,
  categories: ["categories"] as const,
  products: (params?: object) => ["products", params] as const,
  product: (id: number) => ["products", id] as const,
  sales: (params?: object) => ["sales", params] as const,
  sale: (id: number) => ["sales", id] as const,
  movements: (params?: object) => ["inventory", "movements", params] as const,
  lowStock: ["inventory", "low-stock"] as const,
  dashboardSummary: ["dashboard", "summary"] as const,
  dashboardChart: (days: number) => ["dashboard", "sales-chart", days] as const,
  topProducts: ["dashboard", "top-products"] as const,
};
