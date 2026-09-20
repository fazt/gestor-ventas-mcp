import type { AuthorizationServerMetadata } from "@modelcontextprotocol/server";
import { mcpResourceUrl, oauthIssuer, publicUrl } from "../../lib/urls.js";

export function authorizationServerMetadata(): AuthorizationServerMetadata {
  const issuer = oauthIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
    resource_indicators_supported: true,
  } as AuthorizationServerMetadata;
}

export function mcpResource(): string {
  return mcpResourceUrl();
}

export function publicOrigin(): string {
  return publicUrl();
}
