import { createHash, randomBytes } from "node:crypto";

const base = "http://127.0.0.1:4000";
const resource = `${base}/mcp`;

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function main() {
  const unauth = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  console.log("unauth", unauth.status, unauth.headers.get("www-authenticate"));
  if (unauth.status !== 401) throw new Error("expected 401");

  const prm = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
  const as = await fetch(`${base}/.well-known/oauth-authorization-server`);
  console.log("prm", prm.status, Object.keys(await prm.json()));
  const asJson = await as.json();
  console.log("as", as.status, asJson.authorization_endpoint);

  const { verifier, challenge } = pkce();
  const redirect = "http://127.0.0.1:9/cb";
  const dcr = await fetch(`${base}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "smoke",
      redirect_uris: [redirect],
      token_endpoint_auth_method: "none",
    }),
  });
  const client = await dcr.json();
  console.log("dcr", dcr.status, client.client_id);
  if (dcr.status !== 201) throw new Error("dcr failed " + JSON.stringify(client));

  const authorize = await fetch(`${base}/oauth/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirect,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource,
      state: "xyz",
      email: "admin@ventas.com",
      password: "admin123",
    }),
  });
  const location = authorize.headers.get("location");
  console.log("authorize", authorize.status, location);
  if (!location) throw new Error("no redirect");
  const code = new URL(location).searchParams.get("code");
  if (!code) throw new Error("no code");

  const tokenRes = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      client_id: client.client_id,
      code_verifier: verifier,
      resource,
    }),
  });
  const tokens = await tokenRes.json();
  console.log("token", tokenRes.status, Object.keys(tokens));
  if (!tokens.access_token) throw new Error(JSON.stringify(tokens));

  const init = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0.0.0" },
      },
    }),
  });
  const session = init.headers.get("mcp-session-id");
  const initBody = await init.text();
  console.log("initialize", init.status, session, initBody.slice(0, 300));
  if (init.status !== 200) throw new Error("initialize failed");

  const tools = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Session-Id": session ?? "",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  const toolsBody = await tools.text();
  console.log("tools/list", tools.status, toolsBody.slice(0, 500));
  if (tools.status !== 200) throw new Error("tools/list failed");

  const call = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Session-Id": session ?? "",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "dashboard_summary", arguments: {} },
    }),
  });
  const callBody = await call.text();
  console.log("dashboard_summary", call.status, callBody.slice(0, 400));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
