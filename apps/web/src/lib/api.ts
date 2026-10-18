import type { PaginatedResponse } from "@gestor/shared";

// Sin NEXT_PUBLIC_API_URL el navegador pega al proxy `/api/[...path]` del propio Next,
// que reenvia a API_INTERNAL_URL. Al ser same-origin la cookie de sesion viaja en
// cualquier host; apuntar el navegador directo a otro puerto solo funciona en localhost.
export const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorBody = {
  message?: string;
  error?: string;
};

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as ErrorBody;
  return body.message ?? body.error ?? `Error ${res.status}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (res.status === 401) {
    const message = await parseError(res);
    if (typeof window !== "undefined" && window.location.pathname !== "/login" && path !== "/api/auth/login") {
      // Borra la cookie vencida o inválida antes de ir al login: si no, el middleware
      // ve la cookie, redirige /login → /dashboard y se forma un bucle.
      await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
      window.location.assign(`/login?from=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new ApiError(401, message);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** Acepta cualquier objeto plano (los tipos de entrada de zod usan `unknown` en campos coercibles). */
export function toQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function unwrapList<T>(payload: T[] | PaginatedResponse<T>): T[] {
  return Array.isArray(payload) ? payload : payload.data;
}

export function asPaginated<T>(
  payload: T[] | PaginatedResponse<T>,
  fallbackPage = 1,
  fallbackPageSize = 20,
): PaginatedResponse<T> {
  if (Array.isArray(payload)) {
    return {
      data: payload,
      total: payload.length,
      page: fallbackPage,
      pageSize: fallbackPageSize,
    };
  }
  return payload;
}

/**
 * Descarga un archivo autenticado (CSV, etc.). Un <a href> directo no sirve si el panel
 * llama a la API en otro origen; con fetch + credentials viaja la cookie de sesión.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
