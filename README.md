# Gestor de ventas + MCP

Punto de venta, inventario y métricas para pequeños negocios (tiendas, distribuidoras, minimarkets) que **también se opera desde un asistente de IA**. La misma API expone un servidor **MCP** (Streamable HTTP + OAuth 2.1 o tokens personales) para que Claude, ChatGPT o Cursor consulten stock, registren ventas o saquen reportes con los mismos permisos que la persona que los conecta, y cada acción queda en una bitácora auditable.

> **Capturas — pendientes** (se generan en la fase de comprobación; ver [docs/VERIFICACION.md](docs/VERIFICACION.md)). Irán en `docs/screenshots/`: dashboard, punto de venta, historial de ventas, reportes, integraciones IA y actividad IA.

**En qué se diferencia de sus hermanos del catálogo** (`saas-inventory-manager`, `inventory-pos-multibranch`, `ivnentario-app`): este es un POS de una sola tienda cuyo diferencial es la **integración con asistentes de IA vía MCP** (OAuth para conectores web, tokens con permisos para Claude Code/Desktop, bitácora de cada tool). No maneja sucursales ni cobros en línea: registra ventas de mostrador con su método de pago.

## Características

- **Punto de venta**: búsqueda por nombre o SKU, carrito, descuento, impuesto configurable (p. ej. IGV 18 %), métodos efectivo/tarjeta/transferencia/Yape. Venta transaccional: valida stock con bloqueo de filas, numera `V-000001`, descuenta inventario y registra el movimiento. Montos calculados en centavos.
- **Ventas**: historial con búsqueda (código, cliente, documento), filtros por fecha, estado y método de pago, **exportación CSV** (protegida contra fórmulas), comprobante imprimible y **cancelación con motivo** que repone el stock (admin: cualquiera; vendedor: solo las suyas del día).
- **Inventario (kardex)**: entradas, salidas manuales (merma, rotura, devolución) y ajustes por conteo físico; cada cambio deja movimiento con usuario y motivo. Alertas de stock bajo.
- **Catálogo**: productos y categorías con baja lógica; edición parcial real (cambiar el precio ya no resetea el stock).
- **Dashboard y reportes**: ventas de hoy y del mes, ticket promedio, **margen bruto** (costo congelado en cada venta), serie diaria, más vendidos y reporte por rango con desglose por método de pago, vendedor y categoría. Los cortes de día/mes usan la zona horaria de la tienda (`STORE_TIMEZONE`).
- **Equipo**: administradores y vendedores, alta/edición/desactivación (desactivar corta la sesión y revoca sus tokens al instante), cambio de contraseña.
- **Servidor MCP** (`/mcp`): 20 tools (`search`, `fetch`, `list_products`, `create_sale`, `cancel_sale`, `adjust_stock`, `sales_report`, `top_products`…), con:
  - **OAuth 2.1** con registro dinámico (RFC 7591), PKCE S256, metadatos RFC 8414/9728, **pantalla de consentimiento** y rotación de refresh tokens con detección de reutilización.
  - **Tokens personales** `gv_…` de solo lectura o lectura/escritura, con vencimiento y revocación, para Claude Code, Claude Desktop, Cursor o scripts.
  - **Bitácora** de cada llamada (usuario, cliente, tool, argumentos saneados, resultado, duración) visible en «Actividad IA».
- **Producción**: variables validadas al arrancar, logs JSON (pino) sin query strings ni secretos, errores centralizados, rate limiting (login por IP/correo, registro OAuth, MCP por token), helmet/CORS, `/health` y `/health/ready`, apagado ordenado, Dockerfiles y `docker-compose.prod.yml`, OpenAPI 3.1 + Swagger UI, modo oscuro, 404/500 propios.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **API**: Express 5 + TypeScript (ejecutado con `tsx`), Zod 4, JWT, bcryptjs, pino, express-rate-limit, `@modelcontextprotocol/*` v2
- **Base de datos**: PostgreSQL 17 + Drizzle ORM (migraciones SQL versionadas en `packages/db/drizzle`)
- **Panel**: Next.js 16 (App Router, salida standalone), React 19, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query, react-hook-form, Recharts
- **Tests**: Vitest + Supertest contra una base Postgres de test

## Puesta en marcha (desarrollo)

Requisitos: Node.js 20.19+, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env                       # API + migraciones + seed
cp apps/web/.env.example apps/web/.env.local
pnpm db:up                                 # Postgres en 127.0.0.1:5499 (DB_PORT para cambiarlo)
pnpm db:migrate
pnpm db:seed                               # usuarios demo, 16 productos y 120 ventas (idempotente)
pnpm dev                                   # API :4070 y panel :5239
```

| Servicio | URL |
|----------|-----|
| Panel | http://127.0.0.1:5239 |
| API | http://127.0.0.1:4070 |
| Health / readiness | http://127.0.0.1:4070/health · `/health/ready` |
| Swagger UI | http://127.0.0.1:4070/api/docs/ |
| MCP (Streamable HTTP) | http://127.0.0.1:4070/mcp |
| Metadatos OAuth | http://127.0.0.1:4070/.well-known/oauth-authorization-server |

El navegador llama a `/api/*` del propio panel y Next lo reenvía a `API_INTERNAL_URL`: la cookie de sesión es del mismo origen en cualquier despliegue.

### Credenciales demo

Tras `pnpm db:seed` (contraseña `admin123` en desarrollo; en producción se exige `SEED_*_PASSWORD`):

- **Admin**: `admin@ventas.com`
- **Vendedor**: `vendedor@ventas.com` (vende, consulta y mueve inventario; no edita catálogo ni equipo)

Con `NEXT_PUBLIC_DEMO_MODE=true` el login las muestra y las precarga.

## Conectar un asistente de IA

Guía completa: **[docs/INTEGRACION-CLAUDE.md](docs/INTEGRACION-CLAUDE.md)** (Claude Code, Claude Desktop, Claude.ai, ChatGPT, Cursor, permisos y tools).

Resumen con un token personal (panel → **Integraciones IA → Nuevo token**, o `pnpm api:token`):

```bash
claude mcp add --transport http gestor-ventas http://127.0.0.1:4070/mcp \
  --header "Authorization: Bearer gv_..."
```

Los conectores web (Claude.ai, ChatGPT) usan OAuth: basta con la URL pública HTTPS de `/mcp`; el usuario inicia sesión y autoriza en una pantalla de consentimiento.

## Producción con Docker

```bash
cp .env.prod.example .env.prod             # cambia POSTGRES_PASSWORD, JWT_SECRET y PUBLIC_URL
pnpm prod:up                               # = docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

- Panel en `http://localhost:8139` (`WEB_PORT`). MCP, OAuth y `.well-known` se sirven en el mismo dominio gracias a los rewrites del panel, así que `PUBLIC_URL` es la URL del panel.
- La API aplica las migraciones al arrancar (`drizzle-kit migrate`) y, con `SEED_ON_START=true`, carga la demo.
- Pon delante un proxy con HTTPS (Caddy, Traefik, nginx) y deja `COOKIE_SECURE=true`.
- Railway u otro PaaS: dos servicios con `apps/api/Dockerfile` y `apps/web/Dockerfile` (contexto = raíz del repo); en la web, `API_INTERNAL_URL` debe existir también como build arg.

## Variables de entorno

Todas están documentadas en [`.env.example`](.env.example) (API/DB), [`apps/web/.env.example`](apps/web/.env.example) (panel) y [`.env.prod.example`](.env.prod.example) (compose de producción). Las más importantes:

| Variable | Para qué |
|----------|----------|
| `DATABASE_URL` | Postgres (dev: puerto 5499) |
| `JWT_SECRET` | Firma de sesiones y tokens OAuth. En producción, 32+ caracteres o la API no arranca |
| `PUBLIC_URL` | URL pública (issuer OAuth y `resource` MCP = `PUBLIC_URL/mcp`) |
| `WEB_ORIGIN` | Orígenes del panel para CORS (coma) |
| `STORE_TIMEZONE`, `STORE_CURRENCY`, `STORE_TAX_RATE` | Zona horaria de los cortes, moneda e impuesto |
| `COOKIE_SAMESITE`, `COOKIE_SECURE` | Cookie de sesión del panel |
| `LOGIN_MAX_FAILED_PER_15M`, `MCP_MAX_REQUESTS_PER_MIN`… | Límites |
| `API_INTERNAL_URL` (web) | URL interna de la API para el proxy y los rewrites |

## Scripts

```bash
pnpm dev | build | typecheck | lint | test
pnpm db:up | db:migrate | db:generate | db:seed
pnpm api:token -- --email=vendedor@ventas.com --scopes=read --days=30
pnpm --filter @gestor/api docs:generate    # escribe apps/api/openapi.json
node apps/api/scripts/smoke-mcp.mjs http://127.0.0.1:4070   # humo OAuth + MCP de punta a punta
```

Tests: `pnpm test` crea (si no existe) y migra `gestor_ventas_test` en el mismo Postgres de desarrollo (`TEST_DATABASE_URL`).

## Estructura

```
gestor-ventas-mcp/
├── apps/
│   ├── api/                  # Express 5: REST /api, MCP /mcp, OAuth /oauth
│   │   ├── src/modules/      # auth, products, categories, sales, inventory, dashboard,
│   │   │                     # users, tokens, mcp (tools + sesiones + bitácora), oauth
│   │   ├── src/lib/          # env, logger, rate-limit, money, time (zona horaria), csv…
│   │   ├── test/             # Vitest + Supertest
│   │   └── Dockerfile
│   └── web/                  # Next.js 16: panel, proxy /api, rewrites MCP/OAuth
├── packages/
│   ├── db/                   # schema Drizzle, migraciones SQL, seed
│   └── shared/               # schemas Zod + tipos compartidos (API, panel y tools MCP)
├── docs/                     # INTEGRACION-CLAUDE.md, VERIFICACION.md
├── docker-compose.yml        # Postgres de desarrollo
└── docker-compose.prod.yml   # db + api + web
```

## Permisos

| Acción | Admin | Vendedor | Token solo lectura | Token lectura/escritura |
|--------|:-----:|:--------:|:------------------:|:-----------------------:|
| Consultar catálogo, ventas, inventario, reportes | ✔ | ✔ | ✔ | ✔ |
| Registrar venta, mover inventario | ✔ | ✔ | ✘ | según rol |
| Cancelar venta | todas | propias del día | ✘ | según rol |
| Crear/editar catálogo | ✔ | ✘ | ✘ | solo si el dueño es admin |
| Gestionar equipo y tokens | ✔ / propios | propios | ✘ | ✘ |
