import type { NextConfig } from "next";

const apiInternalUrl = process.env.API_INTERNAL_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@gestor/shared"],
  async rewrites() {
    if (!apiInternalUrl) return [];
    return [
      { source: "/health", destination: `${apiInternalUrl}/health` },
      { source: "/mcp", destination: `${apiInternalUrl}/mcp` },
      { source: "/mcp/:path*", destination: `${apiInternalUrl}/mcp/:path*` },
      {
        source: "/.well-known/:path*",
        destination: `${apiInternalUrl}/.well-known/:path*`,
      },
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
