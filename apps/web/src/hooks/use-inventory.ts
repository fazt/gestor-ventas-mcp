import type {
  AdjustStockInput,
  PaginatedResponse,
  Product,
  StockMovement,
  StockMovementListQuery,
} from "@gestor/shared";
import { api, asPaginated, unwrapList, toQuery } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useStockMovements(params: StockMovementListQuery) {
  return useQuery({
    queryKey: queryKeys.movements(params),
    queryFn: async () => {
      const payload = await api<StockMovement[] | PaginatedResponse<StockMovement>>(
        `/api/inventory/movements${toQuery(params)}`,
      );
      return asPaginated(payload, params.page ?? 1, params.pageSize ?? 20);
    },
  });
}

export function useLowStock() {
  return useQuery({
    queryKey: queryKeys.lowStock,
    queryFn: async () => {
      const payload = await api<Product[] | PaginatedResponse<Product>>("/api/inventory/low-stock");
      return unwrapList(payload);
    },
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AdjustStockInput) =>
      api<StockMovement>("/api/inventory/adjust", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
