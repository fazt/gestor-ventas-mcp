import { api, toQuery } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { DashboardSummary, SalesChartPoint, SalesReport, StoreSettings, TopProduct } from "@/lib/types";
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
    queryFn: () => api<{ data: SalesChartPoint[] }>(`/api/dashboard/sales-chart${toQuery({ days })}`),
    select: (payload) => payload.data,
  });
}

export function useTopProducts(days?: number) {
  return useQuery({
    queryKey: [...queryKeys.topProducts, days ?? "all"],
    queryFn: () => api<{ data: TopProduct[] }>(`/api/dashboard/top-products${toQuery({ limit: 8, days })}`),
    select: (payload) => payload.data,
  });
}

export function useReport(from: string, to: string) {
  return useQuery({
    queryKey: ["dashboard", "report", from, to],
    queryFn: () => api<SalesReport>(`/api/dashboard/report${toQuery({ from, to })}`),
    enabled: Boolean(from && to && from <= to),
  });
}

export function useStoreSettings() {
  return useQuery({
    queryKey: ["dashboard", "settings"],
    queryFn: () => api<StoreSettings>("/api/dashboard/settings"),
    staleTime: 10 * 60_000,
  });
}
