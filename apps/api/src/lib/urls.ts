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

export function loopbackApiUrl(): string {
  return `http://127.0.0.1:${env.PORT}`;
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
  return [...hosts];
}
