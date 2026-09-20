# Gestor de ventas

Panel administrativo y API para catálogo, punto de venta e inventario. Monorepo con pnpm + Turborepo: Express 5 en el backend y Next.js 16 en el frontend, PostgreSQL 17 (Docker) y autenticación JWT en cookie `httpOnly`.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo 2.11
- **API:** Express 5 + TypeScript, Zod 4, JWT en cookie, bcryptjs
- **Documentación:** OpenAPI 3.1 (`zod-openapi`) + Swagger UI
- **Base de datos:** PostgreSQL 17 (Docker Compose) + Drizzle ORM
- **Panel:** Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui, TanStack Query, react-hook-form, Recharts

No hay landing: la app empieza en `/login` y el resto del panel usa un layout con sidebar.

## Estructura

```
app-gestor-ventas/
├── apps/
│   ├── api/          # Express (puerto 4000)
│   └── web/          # Next.js (puerto 3000)
├── packages/
│   ├── db/           # schema Drizzle, migraciones, seed
│   └── shared/       # schemas Zod + tipos compartidos
├── docker-compose.yml
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```

Cada módulo de la API sigue el patrón `*.routes.ts`, `*.service.ts`, `*.schema.ts` (reexportado desde `@gestor/shared`) y `*.openapi.ts`.

## Puertos

| Servicio    | URL |
|-------------|-----|
| Panel       | http://localhost:3000 |
| API         | http://localhost:4000 |
| Health      | http://localhost:4000/health |
| Swagger UI  | http://localhost:4000/api/docs |
| OpenAPI JSON| http://localhost:4000/api/docs.json |
| MCP (Streamable HTTP) | http://localhost:4000/mcp |
| OAuth AS metadata | http://localhost:4000/.well-known/oauth-authorization-server |
| PostgreSQL  | `127.0.0.1:55432` (mapeado a `5432` dentro del contenedor) |

`GET /api/docs` responde **301** hacia `/api/docs/`. Usa la URL con barra final o deja que el navegador siga la redirección.

## Requisitos

- Node.js 20+
- pnpm 10.5.2 (`packageManager` del repo)
- Docker Desktop (para Postgres)

## Arranque

```bash
pnpm install
cp .env.example .env          # en Windows: copy .env.example .env
pnpm db:up                    # docker compose up -d postgres
pnpm db:migrate
pnpm db:seed                  # admin, catálogo y ventas de ejemplo (idempotente)
pnpm dev                      # turbo: API :4000 y web :3000
```

También puedes levantar cada app por separado:

```bash
pnpm --filter @gestor/api dev
pnpm --filter @gestor/web dev
```

### Nota: `DATABASE_URL` y el puerto 55432

Postgres **no** usa el 5432 del host. Docker publica el contenedor en **55432** para no chocar con un Postgres local. El valor correcto es:

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/gestor_ventas
```

### Nota: Next.js y webpack

El script de `apps/web` usa `next dev --port 3000 --webpack` (y `next build --webpack`). Turbopack no resuelve los imports ESM con extensión `.js` de `@gestor/shared` (`export * from "./auth.schema.js"`). Webpack sí, vía `transpilePackages` y `resolve.extensionAlias` en `apps/web/next.config.ts`.

## Credenciales demo

Tras `pnpm db:seed`:

- **Admin:** `admin@ventas.com` / `admin123`
- **Vendedor:** `vendedor@ventas.com` / `admin123` (rol `seller`, sin permiso para `PUT`/`DELETE` de productos y categorías)

El seed crea también categorías, productos y **100 ventas de ejemplo** (`V-DEMO-01` … `V-DEMO-100`) repartidas en hoy, esta semana, este mes y hasta ~6 meses atrás, con varios clientes, métodos de pago, descuentos y algunas canceladas. Si ya existen, no se duplican.

En Swagger UI, ejecuta `POST /api/auth/login` con esas credenciales (Try it out). La cookie `token` queda en el mismo origen (`localhost:4000`) y el resto de endpoints autenticados funcionan sin pegar el JWT a mano.

### Token para probar la API (curl, Postman, tests)

`requireAuth` acepta `Authorization: Bearer <token>` además de la cookie, pero el Bearer tiene que ser de audiencia `api` y ningún endpoint lo emite. Para generarlo en local (necesita Postgres arriba y el usuario sembrado):

```bash
pnpm api:token                                        # admin, dura 7 días
pnpm api:token -- --email=vendedor@ventas.com         # rol seller, para probar los 403
pnpm api:token -- --ttl=never                         # sin exp: suites largas sin regenerar
```

Imprime el JWT y un `curl` listo para pegar. El `--ttl` admite segundos, sufijos `s`/`m`/`h`/`d` o `never` (token sin `exp`, bloqueado si `NODE_ENV=production`). El token va firmado con `JWT_SECRET`, así que solo sirve contra la API que use ese mismo secreto.

## Variables de entorno

Copiar de `.env.example`:

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Conexión a Postgres (**puerto 55432** en el host) |
| `JWT_SECRET` | Secreto para firmar el JWT |
| `PORT` | Puerto de la API (por defecto `4000`) |
| `WEB_ORIGIN` | Origen CORS del panel (`http://localhost:3000`) |
| `PUBLIC_URL` | URL pública de la API (issuer OAuth y resource MCP). En Railway usa `https://<dominio-del-servicio>` o deja que tome `RAILWAY_PUBLIC_DOMAIN` |
| `NEXT_PUBLIC_API_URL` | URL de la API que usa el navegador |

En ChatGPT el conector MCP debe apuntar a **`https://TU-DOMINIO-RAILWAY/mcp`** (HTTPS público), no a localhost. Tras un deploy, en la ficha de la app pulsa **Actualizar** para descubrir `search`, `fetch` y el resto de tools. `PUBLIC_URL` tiene que coincidir con esa misma URL (sin `/mcp`).

En producción, la cookie JWT debería pasar a `SameSite=None; Secure` o a un dominio compartido.

## Funcionalidad

- **Auth:** login, logout, `/me`. Cookie `HttpOnly; SameSite=Lax; Path=/`.
- **Catálogo:** CRUD de categorías y productos (listado paginado, búsqueda por nombre/SKU, soft delete).
- **Ventas:** creación transaccional (valida stock, genera código `V-000001`, descuenta stock, mueve inventario `out`). Cancelar revierte stock con movimientos `in`.
- **Inventario:** historial, bajo stock, ajuste manual auditado.
- **Dashboard:** resumen del día/mes, gráfico por día, top productos, alertas de stock.

Roles: todo lo autenticado exige sesión; borrar/editar productos y categorías requiere `admin`.

## MCP remoto (Streamable HTTP + OAuth 2.1)

La misma API expone un servidor MCP en `http://localhost:4000/mcp`. Un host (Cursor, Claude, etc.) descubre el Authorization Server con RFC 9728 / RFC 8414, registra un cliente (RFC 7591), autoriza con PKCE y llama a `/mcp` con `Authorization: Bearer`.

Las tools no reenvían ese access token a la REST API: validan el JWT MCP (`aud` = `PUBLIC_URL/mcp`) y llaman a `/api` con un JWT corto distinto (`aud` = `api`).

Tools: `search`, `fetch`, `list_products`, `get_product`, `list_categories`, `get_category`, `create_category`, `list_sales`, `get_sale`, `create_sale`, `cancel_sale`, `list_low_stock`, `adjust_stock`, `dashboard_summary`.

ChatGPT (Apps / modo desarrollador) usa sobre todo `search` y `fetch`. Tras cambiar tools, en la ficha de la app pulsa **Actualizar** para volver a descubrir acciones. ChatGPT en la nube no alcanza `localhost`; hace falta un túnel HTTPS público hacia `/mcp`.

En Cursor, un servidor remoto:

```json
{
  "mcpServers": {
    "gestor-ventas": {
      "url": "http://localhost:4000/mcp"
    }
  }
}
```

Al conectar, el host abre el login OAuth (`/oauth/authorize`). Usa las credenciales demo. En local el issuer es HTTP; eso está permitido solo fuera de producción.

Smoke interno: `node apps/api/scripts/smoke-mcp.mjs` (API en marcha).

## Scripts útiles

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm api:token                            # JWT Bearer para probar la API
pnpm --filter @gestor/api docs:generate   # escribe apps/api/openapi.json
pnpm build
```
