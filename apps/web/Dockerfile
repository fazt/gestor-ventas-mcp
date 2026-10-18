# syntax=docker/dockerfile:1.7
# Panel Next.js (salida standalone). Se construye desde la raíz del monorepo:
#   docker build -f apps/web/Dockerfile --build-arg API_INTERNAL_URL=http://api:4070 -t gestor-ventas-web .

FROM node:22-alpine AS base
RUN corepack enable
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---- build ----
FROM base AS build
# Los rewrites de /mcp, /oauth y /.well-known se resuelven en el build: la URL interna
# de la API tiene que existir aquí (y también en runtime para el proxy /api).
ARG API_INTERNAL_URL=http://api:4070
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_DEMO_MODE=false
ARG NEXT_PUBLIC_CURRENCY=PEN
ARG NEXT_PUBLIC_LOCALE=es-PE
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_PUBLIC_CURRENCY=$NEXT_PUBLIC_CURRENCY \
    NEXT_PUBLIC_LOCALE=$NEXT_PUBLIC_LOCALE
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm install --frozen-lockfile --filter "@gestor/web..."
RUN pnpm --filter @gestor/web build

# ---- runtime ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "apps/web/server.js"]
