import type {
  CreateSaleInput,
  PaginatedResponse,
  Sale,
  SaleDetail,
  SaleListQuery,
} from "@gestor/shared";
import { api, asPaginated, toQuery } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useSales(params: SaleListQuery) {
  return useQuery({
    queryKey: queryKeys.sales(params),
    queryFn: async () => {
      const payload = await api<Sale[] | PaginatedResponse<Sale>>(`/api/sales${toQuery(params)}`);
      return asPaginated(payload, params.page ?? 1, params.pageSize ?? 20);
    },
  });
}

export function useSale(id: number) {
  return useQuery({
    queryKey: queryKeys.sale(id),
    queryFn: () => api<SaleDetail>(`/api/sales/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSaleInput) =>
      api<SaleDetail>("/api/sales", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCancelSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<SaleDetail>(`/api/sales/${id}/cancel`, { method: "POST" }),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sale(id) });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
