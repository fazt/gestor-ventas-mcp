import type {
  CreateProductInput,
  PaginatedResponse,
  Product,
  ProductListQuery,
  UpdateProductInput,
} from "@gestor/shared";
import { api, asPaginated, toQuery } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useProducts(params: ProductListQuery) {
  return useQuery({
    queryKey: queryKeys.products(params),
    queryFn: async () => {
      const payload = await api<Product[] | PaginatedResponse<Product>>(
        `/api/products${toQuery(params)}`,
      );
      return asPaginated(payload, params.page ?? 1, params.pageSize ?? 20);
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductInput) =>
      api<Product>("/api/products", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lowStock });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateProductInput & { id: number }) =>
      api<Product>(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lowStock });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lowStock });
    },
  });
}
