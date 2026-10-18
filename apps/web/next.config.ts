import path from "node:path";
import type { NextConfig } from "next";

const apiInternalUrl = process.env.API_INTERNAL_URL?.replace(/\/$/, "");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Imagen Docker mínima: `node apps/web/server.js` sin node_modules completos.
  output: "standalone",
  // Monorepo: el trazado parte de la raíz para incluir packages/shared en el standalone.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  poweredByHeader: false,
  transpilePackages: ["@gestor/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    if (!apiInternalUrl) return [];
    // Con un solo dominio público (el del panel), MCP y OAuth también se sirven desde
    // aquí. En ese caso PUBLIC_URL de la API debe ser la URL del panel.
    return [
      { source: "/health/api", destination: `${apiInternalUrl}/health/ready` },
      { source: "/mcp", destination: `${apiInternalUrl}/mcp` },
      { source: "/mcp/:path*", destination: `${apiInternalUrl}/mcp/:path*` },
      { source: "/oauth/:path*", destination: `${apiInternalUrl}/oauth/:path*` },
      { source: "/.well-known/:path*", destination: `${apiInternalUrl}/.well-known/:path*` },
    ];
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    config.resolve.fullySpecified = false;
    config.module.rules.push({
      test: /\.m?js/,
      resolve: { fullySpecified: false },
    });
    return config;
  },
};

export default nextConfig;
