# Verificación pendiente (código escrito sin ejecutar)

Esta versión se escribió en **modo solo escritura** (bucle nocturno, 2026-10-18): no se instalaron dependencias ni se corrió nada (typecheck, lint, build, tests, Docker ni navegador). Esta lista es lo que hay que comprobar al levantarlo, en orden.

## 0. Dependencias y lockfile

- [ ] `pnpm install` — **el lockfile está desactualizado** a propósito (no se podía regenerar): se añadieron `pino`, `pino-http`, `express-rate-limit`, `vitest`, `supertest`, `@types/supertest`, `pg`, `@types/pg` en `apps/api` y se quitaron `morgan`/`@types/morgan`. Commitear el `pnpm-lock.yaml` nuevo: los Dockerfiles usan `--frozen-lockfile`.
- [ ] Confirmar que `vitest@^5`, `pino@^10`, `pino-http@^11` y `express-rate-limit@^8` resuelven (mismas versiones que `kanban-board`).

## 1. Estáticos

```bash
pnpm typecheck        # db, shared, api, web
pnpm lint             # web (eslint-config-next)
pnpm --filter @gestor/web build
```

Puntos con más riesgo de error de tipos:
- `apps/api/src/modules/mcp/create-server.ts` y `mcp.routes.ts`: firmas de `registerTool`, `AuthInfo.extra` y `requireBearerAuth` del SDK `@modelcontextprotocol/*` v2 (se mantuvo el mismo patrón que el código original, que funcionaba).
- `apps/api/src/app.ts`: tipos de `pinoHttp` (serializers, `customLogLevel`) y `ipKeyGenerator` de express-rate-limit 8.
- Tipos `z.input` en el panel (`ProductListParams`, `SaleListParams`…): en Zod 4 los campos `z.coerce` tienen input `unknown`; `toQuery` acepta `object` por eso.
- `apps/web/src/app/(panel)/actividad/page.tsx`: columna condicional con `satisfies`.
- Next 16 avisa que `middleware.ts` está deprecado en favor de `proxy.ts`: funciona, pero conviene migrarlo leyendo `node_modules/next/dist/docs/`.

## 2. Base de datos y migración escrita a mano

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm db:generate      # debe decir "No schema changes"
```

- [ ] `0002_produccion_mcp.sql` y `meta/0002_snapshot.json` se escribieron a mano (el snapshot se generó con un script a partir del 0001). Si `drizzle-kit generate` produce una migración nueva, revisar la diferencia: lo correcto es que no haya cambios; si solo difiere el snapshot, conservar el SQL a mano y quedarse con el snapshot regenerado.
- [ ] Migrar **una copia** de una base con datos v1: el `UPDATE` rellena `sale_items.unit_cost` con el costo actual y `sales.cancelled_at` de las canceladas; los `CHECK` (`stock >= 0`, `quantity > 0`) fallan si ya hay datos inválidos.
- [ ] El seed nuevo usa códigos `V-DEMO-001…120`; en una base con el seed v1 (`V-DEMO-01…100`) agrega 120 ventas más (no duplica, pero suma).

## 3. Tests

```bash
pnpm test             # crea y migra gestor_ventas_test en el Postgres de dev
```

Suites escritas (sin correr): `unit`, `auth` (login, rate limit, desactivar usuario), `sales` (PUT parcial, ajuste al editar stock, permisos, centavos, venta concurrente por la última unidad, cancelación, regla del vendedor, filtro por zona horaria, CSV), `oauth-mcp` (consentimiento + CSRF, código de un solo uso concurrente, rotación de refresh, 401 con metadatos, tokens read/write, rol, bitácora, revocación).

Riesgos conocidos:
- El test de concurrencia depende del `pg_advisory_xact_lock`; si da flaky, revisar el pool (`DB_POOL_MAX`).
- La bitácora MCP se escribe sin `await`: el test espera 200 ms.
- `mcpSession` envía `MCP-Protocol-Version: 2025-06-18`; si el SDK v2 negocia otra versión, ajustar el helper.

## 4. Humo de la API

```bash
pnpm dev:api
curl -s http://127.0.0.1:4070/health/ready
node apps/api/scripts/smoke-mcp.mjs http://127.0.0.1:4070
```

- [ ] Logs en JSON, sin `?code=`/`?state=` en las URLs de `/oauth/authorize`.
- [ ] `GET /api/no-existe` → 404 (no 401).
- [ ] 6.º login fallido seguido → 429.
- [ ] Swagger en `/api/docs/` muestra las secciones Equipo e Integraciones.

## 5. Recorrido en el navegador (capturas para `docs/screenshots/`)

Con `pnpm dev`, `NEXT_PUBLIC_DEMO_MODE=true`, en 127.0.0.1:5239, escritorio y móvil (390 px), claro y oscuro:

- [ ] Login (credenciales demo visibles), redirección `?from=` solo a rutas internas.
- [ ] Dashboard: 5 tarjetas (incluye margen), gráfico 30 días, más vendidos, stock bajo → enlace a `/productos?buscar=SKU`.
- [ ] Nueva venta: con `STORE_TAX_RATE=18` el total del panel coincide con el que guarda la API.
- [ ] Ventas: búsqueda, filtros, **Exportar CSV** (abre en Excel con tildes), detalle → imprimir comprobante (sin menú en la impresión), cancelar con motivo.
- [ ] Vendedor: no ve «Equipo», no puede cancelar ventas ajenas ni de ayer (no aparece el botón y la API responde 403).
- [ ] Productos: editar precio no cambia el stock; el campo stock está deshabilitado al editar.
- [ ] Inventario: entrada, salida y conteo a 0; historial con nombre de producto y usuario.
- [ ] Reportes: rango del mes, desglose por pago/vendedor/categoría.
- [ ] Integraciones IA: crear token (se muestra una vez), copiar snippets, revocar.
- [ ] Actividad IA: tras usar el MCP aparecen las llamadas con argumentos y errores.
- [ ] Equipo: crear vendedor, desactivarlo (su sesión abierta pasa a 401 y vuelve al login sin bucle).
- [ ] Cookie vencida o inválida: el panel limpia la cookie y vuelve al login (antes podía quedar en bucle login ↔ dashboard).

## 6. MCP con clientes reales

- [ ] Claude Code con token: `claude mcp add --transport http …` → listar tools, `create_sale` con token read (debe fallar) y write.
- [ ] Claude Desktop con `mcp-remote` (Windows: comprobar la cabecera vía `env`).
- [ ] OAuth: Claude.ai o MCP Inspector (`npx @modelcontextprotocol/inspector`) contra una URL HTTPS (túnel) → registro dinámico, consentimiento, canje, refresh.
- [ ] La sesión MCP inactiva > `MCP_SESSION_TTL_MINUTES` se cierra y el cliente reconecta.

## 7. Docker de producción

```bash
cp .env.prod.example .env.prod   # COOKIE_SECURE=false para probar en http://localhost
pnpm prod:up
```

- [ ] La API migra al arrancar; `SEED_ON_START=true` exige `SEED_*_PASSWORD` de 8+ caracteres.
- [ ] Panel en `http://localhost:8139`; `/mcp`, `/oauth/*` y `/.well-known/*` responden a través del panel (rewrites fijados en el build con `API_INTERNAL_URL=http://api:4070`).
- [ ] `/mcp` vía el panel no da 403 de Host (`MCP_ALLOWED_HOSTS=api`). Si falla, revisar qué `Host` envía el proxy de Next.
- [ ] La IP real llega a los rate limits (`TRUST_PROXY`). El proxy `/api` del panel copia `X-Forwarded-For` del cliente; sin un proxy HTTPS delante que lo fije, la IP se puede falsear (por eso también hay límite por correo).
- [ ] `docker compose down` y `docker image prune -f` al terminar.

## Decisiones tomadas

- Se **mantuvo TypeScript** (Express + Drizzle + Next): el stack era sólido y coherente. Los `.py` del repo son tests generados por TestSprite (`testsprite_tests/`), no código del producto.
- Las tools MCP llaman a los servicios directamente (antes hacían HTTP a la propia API por loopback con un JWT interno, lo que impedía testear y duplicaba la autenticación).
- No hay pasarelas de pago: el producto registra cobros de mostrador (efectivo, tarjeta en POS físico, transferencia, Yape). Un cobro en línea sería otra funcionalidad.
