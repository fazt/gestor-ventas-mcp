import type {
  CreateProductInput,
  PaginatedResponse,
  Product,
  ProductListParams,
  UpdateProductInput,
} from "@gestor/shared";
import { api, asPaginated, toQuery } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useProducts(params: ProductListParams) {
  return useQuery({
    queryKey: queryKeys.products(params),
    queryFn: async () => {
      const payload = await api<Product[] | PaginatedResponse<Product>>(`/api/products${toQuery(params)}`);
      return asPaginated(payload, Number(params.page ?? 1), Number(params.pageSize ?? 20));
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
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateProductInput & { id: number }) =>
      api<Product>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<Product>(`/api/products/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}
