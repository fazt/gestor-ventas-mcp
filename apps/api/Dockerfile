# syntax=docker/dockerfile:1.7
# API + servidor MCP del gestor de ventas. Se construye desde la raíz del monorepo:
#   docker build -f apps/api/Dockerfile -t gestor-ventas-api .
#
# La API corre con tsx sobre el código TypeScript (los paquetes del workspace exportan
# .ts), así no hay un paso de compilación que pueda desalinearse con `start`.

FROM node:22-alpine AS base
RUN corepack enable
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
WORKDIR /app

# ---- deps: solo dependencias de producción de api + db + shared ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --filter "@gestor/api..."

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production PORT=4070
COPY --from=deps --chown=node:node /app /app
COPY --chown=node:node tsconfig.base.json ./
COPY --chown=node:node packages/db packages/db
COPY --chown=node:node packages/shared packages/shared
COPY --chown=node:node apps/api/src apps/api/src
COPY --chown=node:node apps/api/tsconfig.json apps/api/
COPY --chown=node:node apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh
RUN chmod +x /app/apps/api/docker-entrypoint.sh
USER node
WORKDIR /app/apps/api
EXPOSE 4070
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health/ready" || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
