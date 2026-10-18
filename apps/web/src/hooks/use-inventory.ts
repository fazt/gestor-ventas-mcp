import type {
  AdjustStockInput,
  PaginatedResponse,
  Product,
  StockMovement,
  StockMovementListParams,
} from "@gestor/shared";
import { api, asPaginated, toQuery, unwrapList } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useStockMovements(params: StockMovementListParams) {
  return useQuery({
    queryKey: queryKeys.movements(params),
    queryFn: async () => {
      const payload = await api<StockMovement[] | PaginatedResponse<StockMovement>>(
        `/api/inventory/movements${toQuery(params)}`,
      );
      return asPaginated(payload, Number(params.page ?? 1), Number(params.pageSize ?? 20));
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
      api<{ product: Product; movement: StockMovement }>("/api/inventory/adjust", {
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
