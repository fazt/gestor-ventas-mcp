import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = token ? "/dashboard" : "/login";
    return NextResponse.redirect(url);
  }

  if (!token && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (token && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Fuera del middleware: estáticos, el proxy /api y las rutas que se reenvían a la API
    // (MCP, OAuth y metadatos .well-known), que tienen su propia autenticación.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|api/|health|mcp|oauth|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
