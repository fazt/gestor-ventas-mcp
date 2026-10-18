# Conectar asistentes de IA al gestor (MCP)

El servidor MCP vive en la misma API, en **`<PUBLIC_URL>/mcp`** (transporte Streamable HTTP). Hay dos formas de autenticarse:

| Método | Para quién | Cómo |
|--------|-----------|------|
| **Token personal** `gv_…` | Claude Code, Claude Desktop, Cursor, scripts, n8n | Cabecera `Authorization: Bearer gv_…` |
| **OAuth 2.1** | Claude.ai (conectores), ChatGPT (apps/modo desarrollador), clientes que descubren el login solos | Solo la URL; el cliente abre la pantalla de inicio de sesión y consentimiento |

En ambos casos el asistente actúa **como el usuario** que creó el token o inició sesión: un vendedor no puede editar catálogo aunque se lo pida a Claude, y todo queda en **Actividad IA**.

## 1. Crear un token personal

- Panel → **Integraciones IA → Nuevo token**: nombre, permisos (*solo lectura* o *lectura y escritura*) y vencimiento. El token se muestra **una sola vez**.
- O desde la terminal (útil en servidores):

  ```bash
  pnpm api:token -- --email=admin@ventas.com --scopes=read,write --days=90 --name="Claude Code"
  ```

Revocar: botón de papelera en Integraciones (efecto inmediato). Desactivar a un usuario revoca todos sus tokens.

## 2. Claude Code

```bash
claude mcp add --transport http gestor-ventas https://ventas.tudominio.com/mcp \
  --header "Authorization: Bearer gv_xxxxxxxx"
```

- En local: `http://127.0.0.1:4070/mcp`.
- `--scope project` lo guarda en `.mcp.json` del proyecto (no subas el token: usa `${GESTOR_TOKEN}` y una variable de entorno).

```json
{
  "mcpServers": {
    "gestor-ventas": {
      "type": "http",
      "url": "https://ventas.tudominio.com/mcp",
      "headers": { "Authorization": "Bearer ${GESTOR_TOKEN}" }
    }
  }
}
```

Pruébalo: «¿cuánto vendimos hoy y qué productos están por agotarse?».

## 3. Claude Desktop

Claude Desktop admite servidores remotos como **conector personalizado** (Ajustes → Conectores → Agregar) usando OAuth: pega la URL HTTPS pública de `/mcp`, inicia sesión y autoriza.

Si prefieres token (o el servidor no es público), usa el puente `mcp-remote` en `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gestor-ventas": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://ventas.tudominio.com/mcp", "--header", "Authorization:${GESTOR_TOKEN}"],
      "env": { "GESTOR_TOKEN": "Bearer gv_xxxxxxxx" }
    }
  }
}
```

(La cabecera va sin espacio después de `:` y el valor en `env` para evitar problemas de comillas en Windows.)

## 4. Claude.ai y ChatGPT (OAuth)

1. La API debe estar en **HTTPS público** (no sirve `localhost`) y `PUBLIC_URL` debe ser exactamente esa URL base (sin `/mcp`).
2. Claude.ai: *Ajustes → Conectores → Agregar conector personalizado* → `https://ventas.tudominio.com/mcp`.
   ChatGPT: *Ajustes → Apps y conectores → Modo desarrollador → Crear* → misma URL, autenticación OAuth.
3. El cliente descubre el servidor de autorización (`/.well-known/oauth-protected-resource` → `/.well-known/oauth-authorization-server`), se registra solo (`/oauth/register`) y abre `/oauth/authorize`.
4. El usuario inicia sesión (o, si ya tiene sesión en el panel, ve **«¿Autorizar a …?»**) y acepta.

Tras cambiar tools, pulsa **Actualizar** en la ficha del conector para que vuelva a leerlas. ChatGPT usa sobre todo `search` y `fetch`.

## 5. Cursor

`.cursor/mcp.json` (no lo subas con el token real):

```json
{
  "mcpServers": {
    "gestor-ventas": {
      "url": "https://ventas.tudominio.com/mcp",
      "headers": { "Authorization": "Bearer gv_xxxxxxxx" }
    }
  }
}
```

Sin `headers`, Cursor usa el flujo OAuth (esquema `cursor://`).

## Tools disponibles

| Tool | Tipo | Qué hace |
|------|------|----------|
| `search`, `fetch` | lectura | Buscar productos/categorías/ventas y ver el detalle (`product:1`, `sale:3`) |
| `list_products`, `get_product` | lectura | Catálogo con filtros (texto, categoría, activos, stock bajo) |
| `list_categories`, `get_category` | lectura | Categorías |
| `list_sales`, `get_sale` | lectura | Ventas por fecha, estado, método de pago o texto |
| `list_low_stock`, `list_stock_movements` | lectura | Reposición y kardex |
| `dashboard_summary`, `sales_by_day`, `top_products`, `sales_report` | lectura | Métricas, margen y reportes por rango |
| `create_sale` | escritura | Registra una venta a precio de catálogo (falla con el detalle si falta stock) |
| `cancel_sale` | escritura (destructiva) | Cancela y repone stock (vendedor: solo las suyas del día) |
| `adjust_stock` | escritura | Entrada, salida manual o conteo físico |
| `create_category`, `create_product`, `update_product` | escritura, solo admin | Catálogo |

Las fechas se interpretan en `STORE_TIMEZONE` y los montos viajan como texto con dos decimales (`"129.90"`).

## Seguridad

- Tokens guardados como SHA-256; el prefijo `gv_` permite detectarlos con *secret scanning*.
- Los tokens no pueden crear otros tokens ni gestionar usuarios (solo la sesión del panel).
- OAuth: clientes públicos con PKCE S256 obligatorio, `redirect_uri` exacto (https, loopback o esquema nativo), códigos de un solo uso canjeados de forma atómica, refresh rotativo con revocación de la familia si se reutiliza uno viejo, consentimiento con token anti-CSRF y página no embebible.
- Validación de `Host` en `/mcp` (DNS rebinding): agrega hosts extra con `MCP_ALLOWED_HOSTS`.
- Límite de peticiones por token (`MCP_MAX_REQUESTS_PER_MIN`), sesiones MCP con caducidad por inactividad y máximo por usuario.
- Bitácora con argumentos saneados (sin contraseñas ni tokens) y purga a los `MCP_AUDIT_RETENTION_DAYS` días.

## Problemas frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| 401 con `resource_metadata` | Falta la cabecera o el token está vencido/revocado |
| 403 «Invalid Host header» | El dominio no está en `PUBLIC_URL`, `WEB_ORIGIN` ni `MCP_ALLOWED_HOSTS` |
| `invalid_target` en OAuth | `PUBLIC_URL` no coincide con la URL que usa el cliente |
| La tool responde «solo lectura» | El token no tiene permiso de escritura: crea otro |
| 404 «Sesión no encontrada» | La sesión MCP caducó por inactividad: el cliente debe reconectar (initialize) |
