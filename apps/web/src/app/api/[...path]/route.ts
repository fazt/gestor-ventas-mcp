export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

function apiBase(): string {
  return process.env.API_INTERNAL_URL?.replace(/\/$/, "") ?? "";
}

// fetch ya entrega el cuerpo descomprimido: reenviar estas cabeceras rompería al cliente.
const DROP_REQUEST_HEADERS = new Set(["host", "connection", "content-length", "accept-encoding"]);
const DROP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const base = apiBase();
  if (!base) {
    return Response.json({ message: "API_INTERNAL_URL is not set" }, { status: 500 });
  }

  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = `${base}/api/${path.join("/")}${incoming.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (DROP_REQUEST_HEADERS.has(key)) return;
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(target, init);
  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (DROP_RESPONSE_HEADERS.has(key) || key === "set-cookie") return;
    out.append(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    out.append("set-cookie", cookie);
  }

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
