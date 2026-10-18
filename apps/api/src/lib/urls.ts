import { env } from "./env.js";

export function publicUrl(): string {
  return env.PUBLIC_URL.replace(/\/$/, "");
}

export function mcpResourceUrl(): string {
  return `${publicUrl()}/mcp`;
}

export function oauthIssuer(): string {
  return publicUrl();
}

export function protectedResourceMetadataUrl(): string {
  return `${publicUrl()}/.well-known/oauth-protected-resource`;
}

export function authorizationServerMetadataUrl(): string {
  return `${publicUrl()}/.well-known/oauth-authorization-server`;
}

export function mcpAllowedHosts(): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1", "[::1]"]);

  const addHost = (value: string | undefined) => {
    if (!value) {
      return;
    }
    try {
      const hostname = value.includes("://") ? new URL(value).hostname : value.split(":")[0];
      if (hostname) {
        hosts.add(hostname);
      }
    } catch {
      hosts.add(value);
    }
  };

  addHost(env.PUBLIC_URL);
  addHost(env.RAILWAY_PUBLIC_DOMAIN);
  addHost(process.env.RAILWAY_STATIC_URL);
  // El panel puede reenviar /mcp con su propio Host (nginx o rewrites de Next).
  for (const origin of env.WEB_ORIGINS) addHost(origin);
  // Hosts extra (p. ej. el nombre del servicio en Docker): MCP_ALLOWED_HOSTS=api,gestor.local
  for (const host of (process.env.MCP_ALLOWED_HOSTS ?? "").split(",")) addHost(host.trim() || undefined);
  return [...hosts];
}
