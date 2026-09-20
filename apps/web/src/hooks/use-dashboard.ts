import { api, toQuery } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { DashboardSummary, SalesChartPoint, TopProduct } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.dashboardSummary,
    queryFn: () => api<DashboardSummary>("/api/dashboard/summary"),
  });
}

export function useSalesChart(days = 30) {
  return useQuery({
    queryKey: queryKeys.dashboardChart(days),
    queryFn: () =>
      api<SalesChartPoint[] | { data: SalesChartPoint[] }>(
        `/api/dashboard/sales-chart${toQuery({ days })}`,
      ),
    select: (payload) => (Array.isArray(payload) ? payload : payload.data),
  });
}

export function useTopProducts() {
  return useQuery({
    queryKey: queryKeys.topProducts,
    queryFn: () => api<TopProduct[] | { data: TopProduct[] }>("/api/dashboard/top-products"),
    select: (payload) => (Array.isArray(payload) ? payload : payload.data),
  });
}
