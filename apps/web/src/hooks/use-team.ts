import type {
  ApiToken,
  ChangePasswordInput,
  CreateApiTokenInput,
  CreatedApiToken,
  CreateUserInput,
  McpAuditLog,
  McpAuditParams,
  PaginatedResponse,
  UpdateUserInput,
  User,
} from "@gestor/shared";
import { api, toQuery } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ---------- Equipo (admin) ----------

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ data: User[] }>("/api/users"),
    select: (payload) => payload.data,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserInput) => api<User>("/api/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateUserInput & { id: number }) =>
      api<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordInput) =>
      api<void>("/api/auth/password", { method: "POST", body: JSON.stringify(body) }),
  });
}

// ---------- Integraciones ----------

export function useApiTokens() {
  return useQuery({
    queryKey: ["tokens"],
    queryFn: () => api<{ data: ApiToken[]; mcpUrl: string }>("/api/tokens"),
  });
}

export function useCreateApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateApiTokenInput) =>
      api<CreatedApiToken>("/api/tokens", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tokens"] }),
  });
}

export function useRevokeApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<ApiToken>(`/api/tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tokens"] }),
  });
}

export function useMcpActivity(params: McpAuditParams) {
  return useQuery({
    queryKey: ["mcp-activity", params],
    queryFn: () => api<PaginatedResponse<McpAuditLog>>(`/api/mcp/activity${toQuery(params)}`),
    refetchInterval: 30_000,
  });
}
