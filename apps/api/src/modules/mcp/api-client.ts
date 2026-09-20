import type { UserRole } from "@gestor/shared";
import { signApiToken } from "../../lib/jwt.js";
import { loopbackApiUrl } from "../../lib/urls.js";

export type McpActor = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
};

export async function apiFetch(
  actor: McpActor,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const token = signApiToken({
    sub: String(actor.id),
    role: actor.role,
    email: actor.email,
    name: actor.name,
  });

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${loopbackApiUrl()}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let body: unknown = text;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  return { status: response.status, body };
}

export function asToolText(payload: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}
