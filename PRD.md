# PRD — Gestor de ventas

| Campo | Valor |
|-------|-------|
| Producto | Gestor de ventas (panel administrativo + API) |
| Versión del documento | 1.0 |
| Fecha | Septiembre 2026 |
| Estado | v1 implementada; este PRD documenta el alcance vigente y el backlog |
| Repositorio | `app-gestor-ventas` (monorepo pnpm + Turborepo) |

---

## 1. Resumen ejecutivo

Gestor de ventas es una aplicación web para negocios pequeños y medianos que necesitan vender, controlar stock y ver cómo va el negocio desde un solo lugar. Reemplaza la combinación habitual de cuaderno, hoja de cálculo y memoria del dueño por un sistema donde cada venta descuenta inventario automáticamente y deja rastro auditable.

El producto se compone de tres superficies sobre la misma lógica de negocio:

1. **Panel web** (Next.js): punto de venta, catálogo, inventario y dashboard.
2. **API REST** (Express + OpenAPI): contrato documentado y navegable en Swagger UI.
3. **Servidor MCP remoto**: permite que asistentes de IA (ChatGPT, Claude, Cursor) consulten y operen el negocio en lenguaje natural, con autorización OAuth 2.1.

La tercera superficie es el diferenciador: el mismo backend que sirve al panel expone herramientas para que un asistente responda "¿cuánto vendí hoy?" o "registra una venta de 2 teclados" sin que nadie abra el navegador.

---

## 2. Problema

Un comercio pequeño que vende a diario enfrenta tres fricciones concretas:

- **El stock no cuadra.** Se vende sin descontar, se descuenta sin vender, y nadie sabe cuándo se rompió el conteo. No hay historial que explique la diferencia.
- **No hay visibilidad.** Saber cuánto se vendió este mes o qué producto se mueve más exige sumar a mano.
- **Se quiebra sin aviso.** Los productos se agotan porque nadie revisa mínimos hasta que un cliente pregunta.

Las alternativas existentes son o demasiado caras y complejas (ERP completo), o demasiado frágiles (hoja de cálculo compartida sin validaciones ni auditoría).

## 3. Objetivos

| # | Objetivo | Cómo se mide |
|---|----------|--------------|
| O1 | Que toda venta descuente stock de forma atómica y auditable | 100% de las ventas generan movimiento de inventario asociado |
| O2 | Que el inventario nunca quede en estado inconsistente | Cero ventas con stock resultante negativo |
| O3 | Dar visibilidad del negocio sin trabajo manual | Dashboard con métricas del día y del mes disponible al abrir sesión |
| O4 | Prevenir quiebres de stock | Alerta activa para todo producto en o por debajo de su mínimo |
| O5 | Permitir operar el negocio desde un asistente de IA | Las operaciones núcleo disponibles como herramientas MCP autorizadas |

### No-objetivos (v1)

- Facturación electrónica o integración con entidades tributarias.
- Cobros con pasarela de pago real. El método de pago se registra, no se procesa.
- Multi-sucursal o multi-empresa. Un despliegue atiende un negocio.
- App móvil nativa. El panel es responsive, no hay build nativo.
- Contabilidad, compras a proveedores u órdenes de reposición.

---

## 4. Usuarios

### Administrador
Dueño o encargado. Configura el catálogo, revisa resultados y corrige errores. Es el único que puede editar o eliminar productos y categorías. Necesita ver el negocio completo en pocos clics.

### Vendedor (`seller`)
Atiende al cliente en mostrador. Su recorrido crítico es: buscar producto, armar carrito, cobrar. Puede consultar catálogo, registrar ventas y ajustar inventario, pero no destruir configuración.

> **Nota de estado:** el rol `seller` existe en el modelo de datos y en el control de acceso, pero v1 no incluye pantalla ni endpoint de gestión de usuarios. Hoy solo existe el administrador que crea el seed. Ver backlog B1.

### Asistente de IA (actor no humano)
Un host MCP actuando en nombre de un usuario autenticado. Opera con los mismos permisos que la persona que autorizó la conexión.

---

## 5. Alcance funcional

### 5.1 Autenticación y sesión

| ID | Requisito |
|----|-----------|
| RF-AUTH-01 | El usuario inicia sesión con correo y contraseña (mínimo 6 caracteres). |
| RF-AUTH-02 | La sesión se entrega como JWT en cookie `httpOnly`, `SameSite=Lax`, `Path=/`, con vigencia de 7 días. `Secure` se activa en producción. |
| RF-AUTH-03 | Las contraseñas se almacenan con hash bcrypt. Nunca se devuelven por la API. |
| RF-AUTH-04 | Un usuario inactivo no puede iniciar sesión ni usar un token previamente emitido. |
| RF-AUTH-05 | Credenciales inválidas y usuario inexistente devuelven el mismo error 401 genérico, sin revelar cuál de los dos falló. |
| RF-AUTH-06 | El panel redirige a `/login` cualquier ruta sin cookie de sesión, y a `/dashboard` si ya hay sesión. |
| RF-AUTH-07 | Toda ruta bajo `/api` excepto login y logout exige sesión válida. |

La API acepta dos formas de credencial: la cookie del panel (audiencia `web`) y un bearer token de servicio de vida corta (audiencia `api`), usado internamente por las herramientas MCP.

### 5.2 Catálogo: categorías

| ID | Requisito |
|----|-----------|
| RF-CAT-01 | Listar todas las categorías ordenadas por nombre. Sin paginación: se asume un volumen manejable. |
| RF-CAT-02 | Crear categoría con nombre único (1–255) y descripción opcional (hasta 1000). |
| RF-CAT-03 | Editar categoría. Restringido a administrador. |
| RF-CAT-04 | Eliminar categoría. Restringido a administrador. Es borrado físico. |
| RF-CAT-05 | Si la categoría tiene productos asociados, el borrado se rechaza con 409 y mensaje explicativo, en lugar de dejar productos huérfanos. |
| RF-CAT-06 | Un nombre duplicado devuelve 409 con mensaje claro, no un error de base de datos. |

### 5.3 Catálogo: productos

| ID | Requisito |
|----|-----------|
| RF-PROD-01 | Listar productos paginado (página, tamaño 1–100, por defecto 20), ordenado por más reciente. |
| RF-PROD-02 | Filtrar por texto libre sobre nombre o SKU (insensible a mayúsculas), por categoría y por estado activo. |
| RF-PROD-03 | El texto de búsqueda escapa `%`, `_` y `\` para que no altere el patrón de coincidencia. |
| RF-PROD-04 | Crear producto con SKU único, nombre, categoría existente, precio, costo, stock inicial y stock mínimo. |
| RF-PROD-05 | Crear o editar con una categoría inexistente devuelve 404. |
| RF-PROD-06 | SKU duplicado devuelve 409. |
| RF-PROD-07 | Editar producto. Restringido a administrador. Todos los campos son opcionales en la edición. |
| RF-PROD-08 | Eliminar producto es **borrado lógico**: se marca `isActive = false` y se conserva el histórico de ventas que lo referencia. Restringido a administrador. |
| RF-PROD-09 | Precio y costo se manejan como decimales de 2 posiciones y viajan como cadena (`"129.90"`), nunca como número de punto flotante. |

### 5.4 Punto de venta

El recorrido central del producto. Buscar, agregar al carrito, ajustar cantidades, cobrar.

| ID | Requisito |
|----|-----------|
| RF-POS-01 | El vendedor busca productos activos por nombre o SKU y los agrega al carrito con un clic. |
| RF-POS-02 | El carrito permite subir, bajar y quitar cantidades, y bloquea en la interfaz cualquier cantidad que supere el stock disponible. |
| RF-POS-03 | La venta registra cliente y documento opcionales, método de pago y descuento. |
| RF-POS-04 | Métodos de pago soportados: efectivo, tarjeta, transferencia y Yape. |
| RF-POS-05 | La venta requiere al menos un ítem. |
| RF-POS-06 | El precio unitario se toma del catálogo en el servidor al momento de crear la venta; el cliente no puede imponer un precio. |
| RF-POS-07 | Ítems repetidos del mismo producto se consolidan en una sola línea antes de validar stock. |
| RF-POS-08 | Si algún producto no alcanza, la venta se rechaza completa con 409 y el detalle de cada faltante: producto, cantidad pedida y disponible. |
| RF-POS-09 | El descuento no puede superar el subtotal, y ni descuento ni impuesto pueden ser negativos. El total nunca es negativo. |
| RF-POS-10 | Cada venta recibe un código correlativo con formato `V-000001`. |
| RF-POS-11 | Crear una venta es **una sola transacción**: valida stock, inserta venta e ítems, descuenta stock y registra los movimientos de salida. Si algo falla, no queda nada a medias. |
| RF-POS-12 | Cancelar una venta devuelve el stock de cada ítem, registra movimientos de entrada con motivo `Cancelación V-xxxxxx` y marca la venta como cancelada. |
| RF-POS-13 | Una venta ya cancelada no se puede cancelar de nuevo (409). Las ventas no se eliminan. |
| RF-POS-14 | Listar ventas paginado, con filtro por estado y por rango de fechas (`YYYY-MM-DD`, inclusivo en ambos extremos). |
| RF-POS-15 | Ver el detalle de una venta con todas sus líneas. |
| RF-POS-16 | Cada línea guarda el nombre del producto al momento de la venta, para que renombrar o dar de baja un producto no altere el historial. |

**Concurrencia.** Crear y cancelar ventas se serializan con un advisory lock de PostgreSQL y bloqueo de filas (`SELECT ... FOR UPDATE`) sobre los productos involucrados. Dos cajas vendiendo la última unidad no pueden sobrevender.

### 5.5 Inventario

| ID | Requisito |
|----|-----------|
| RF-INV-01 | Todo cambio de stock genera un movimiento con tipo, cantidad, stock anterior, stock nuevo, motivo, usuario responsable y venta asociada si aplica. |
| RF-INV-02 | Tipos de movimiento: entrada (`in`), salida (`out`) y ajuste (`adjustment`). |
| RF-INV-03 | Historial de movimientos paginado, filtrable por producto y por tipo, del más reciente al más antiguo. |
| RF-INV-04 | Una entrada suma la cantidad indicada al stock actual. |
| RF-INV-05 | Un ajuste **fija** el stock al valor indicado y registra como cantidad la diferencia absoluta contra el valor anterior. |
| RF-INV-06 | Todo movimiento manual exige un motivo escrito (1–500 caracteres). |
| RF-INV-07 | Un ajuste que no cambia el stock se rechaza con 400. El stock resultante nunca puede ser negativo. |
| RF-INV-08 | Listado de stock bajo: productos activos cuyo stock es menor o igual a su mínimo, ordenados por criticidad. |
| RF-INV-09 | Los movimientos son un registro de auditoría: no se editan ni se borran. |

### 5.6 Dashboard

| ID | Requisito |
|----|-----------|
| RF-DASH-01 | Tarjetas de resumen: total y número de tickets de hoy, total y número de tickets del mes, ticket promedio del mes y cantidad de productos en stock bajo. |
| RF-DASH-02 | Todas las métricas consideran únicamente ventas completadas. Las canceladas no suman. |
| RF-DASH-03 | Gráfico de ventas por día de los últimos 30 días. Los días sin ventas aparecen en cero, no se omiten. |
| RF-DASH-04 | Ranking de productos más vendidos por unidades, con el monto acumulado de cada uno. |
| RF-DASH-05 | Tabla de alertas de stock bajo con producto, SKU, stock actual y mínimo. |
| RF-DASH-06 | El ticket promedio es el total del mes dividido entre el número de tickets del mes; con cero ventas devuelve cero, sin error. |

### 5.7 Integración con asistentes de IA (MCP)

| ID | Requisito |
|----|-----------|
| RF-MCP-01 | La API expone un servidor MCP en `/mcp` sobre Streamable HTTP. |
| RF-MCP-02 | La autorización sigue OAuth 2.1 con PKCE, descubrimiento de metadatos (RFC 9728 y RFC 8414) y registro dinámico de clientes (RFC 7591). El host no necesita configuración manual de credenciales. |
| RF-MCP-03 | El usuario autoriza la conexión con sus credenciales del panel en una pantalla de consentimiento propia. |
| RF-MCP-04 | El token de acceso MCP es de vida corta (15 minutos) y está acotado al recurso `/mcp` por su audiencia. |
| RF-MCP-05 | El token MCP **no** se reenvía a la API REST. Las herramientas lo validan y emiten internamente un token distinto de 5 minutos con audiencia `api`. Un token filtrado no sirve para hablarle directamente al API. |
| RF-MCP-06 | Se valida la cabecera `Host` de las peticiones a `/mcp` contra una lista permitida, como defensa ante rebinding de DNS. |
| RF-MCP-07 | Herramientas de descubrimiento: `search` (productos, categorías y ventas con ids tipo `product:1`) y `fetch` (detalle por id). |
| RF-MCP-08 | Herramientas de operación: `list_products`, `get_product`, `list_categories`, `get_category`, `create_category`, `list_sales`, `get_sale`, `create_sale`, `cancel_sale`, `list_low_stock`, `adjust_stock`, `dashboard_summary`. |
| RF-MCP-09 | Cada herramienta declara si es de solo lectura o destructiva, para que el host pueda pedir confirmación antes de operaciones como cancelar una venta. |
| RF-MCP-10 | Las herramientas reutilizan los endpoints REST. No existe lógica de negocio duplicada. |

### 5.8 Documentación de la API

| ID | Requisito |
|----|-----------|
| RF-DOC-01 | Especificación OpenAPI 3.1 generada desde los mismos esquemas Zod que validan en tiempo de ejecución. La documentación no puede divergir del comportamiento. |
| RF-DOC-02 | Swagger UI navegable en `/api/docs` y JSON crudo en `/api/docs.json`. |
| RF-DOC-03 | Desde Swagger se puede hacer login y ejercitar los endpoints autenticados, porque la cookie queda en el mismo origen. |
| RF-DOC-04 | Endpoint `/health` sin autenticación para sondas de disponibilidad. |

---

## 6. Modelo de datos

PostgreSQL 17 con Drizzle ORM y migraciones versionadas.

| Tabla | Propósito | Notas |
|-------|-----------|-------|
| `users` | Cuentas del sistema | Correo único, hash de contraseña, rol (`admin`/`seller`), bandera de activo |
| `categories` | Agrupación del catálogo | Nombre único |
| `products` | Catálogo | SKU único, precio y costo `numeric(12,2)`, stock y stock mínimo, baja lógica |
| `sales` | Cabecera de venta | Código único, subtotal, descuento, impuesto, total, método de pago, estado |
| `sale_items` | Líneas de venta | Guarda nombre y precio unitario históricos |
| `stock_movements` | Auditoría de inventario | Tipo, cantidad, stock anterior y nuevo, motivo, usuario, venta opcional |
| `oauth_clients` | Clientes MCP registrados dinámicamente | URIs de redirección, método de autenticación |
| `oauth_authorization_codes` | Códigos de autorización de un solo uso | Se guardan hasheados, con desafío PKCE y expiración |
| `oauth_refresh_tokens` | Refresh tokens MCP | Hasheados y revocables |

**Decisiones de modelado relevantes:**

- El dinero se almacena como `numeric(12,2)` y se transporta como cadena. Nunca se usa punto flotante para importes.
- Las líneas de venta desnormalizan el nombre del producto a propósito: el ticket de hace seis meses debe mostrar lo que decía entonces.
- Los productos se dan de baja lógicamente porque están referenciados por ventas históricas.
- Los códigos y tokens OAuth se persisten hasheados, no en claro.

---

## 7. Contrato de la API

Base: `/api`. Todas las respuestas paginadas devuelven `{ data, total, page, pageSize }`.

| Método | Ruta | Acceso |
|--------|------|--------|
| POST | `/auth/login` | Público |
| POST | `/auth/logout` | Público |
| GET | `/auth/me` | Autenticado |
| GET | `/categories` · `/categories/:id` | Autenticado |
| POST | `/categories` | Autenticado |
| PUT · DELETE | `/categories/:id` | Administrador |
| GET | `/products` · `/products/:id` | Autenticado |
| POST | `/products` | Autenticado |
| PUT · DELETE | `/products/:id` | Administrador |
| GET | `/sales` · `/sales/:id` | Autenticado |
| POST | `/sales` · `/sales/:id/cancel` | Autenticado |
| GET | `/inventory/movements` · `/inventory/low-stock` | Autenticado |
| POST | `/inventory/adjust` | Autenticado |
| GET | `/dashboard/summary` · `/sales-chart` · `/top-products` | Autenticado |

**Convención de errores.** Códigos HTTP con significado consistente: 400 validación, 401 sin sesión o token inválido, 403 rol insuficiente, 404 recurso inexistente, 409 conflicto de negocio (SKU o nombre duplicado, stock insuficiente, venta ya cancelada, categoría con productos). El 409 de stock insuficiente incluye el detalle estructurado de faltantes para que la interfaz explique exactamente qué falló.

---

## 8. Experiencia del panel

| Ruta | Contenido |
|------|-----------|
| `/login` | Único punto de entrada. No hay landing pública. |
| `/dashboard` | Métricas, gráfico de 30 días, top de productos y alertas de stock. |
| `/productos` | Listado con búsqueda y filtros, alta y edición en diálogo, baja con confirmación. |
| `/categorias` | Gestión de categorías. |
| `/ventas` | Historial con filtros de estado y fecha. |
| `/ventas/nueva` | Punto de venta: buscador, carrito y cobro. |
| `/ventas/[id]` | Detalle del ticket con opción de cancelar. |
| `/inventario` | Stock actual, formulario de ajuste e historial de movimientos. |

**Principios de interacción aplicados:**

- El layout es un panel con barra lateral colapsable y navegación inferior en móvil.
- Las operaciones destructivas (eliminar, cancelar venta) piden confirmación explícita.
- El resultado de cada acción se comunica con notificaciones toast, y los errores del servidor se muestran con su mensaje real en lugar de un genérico.
- Las tablas muestran esqueletos de carga en vez de saltos de layout.
- El punto de venta valida stock en la interfaz antes de enviar, para dar respuesta inmediata, pero la validación autoritativa siempre está en el servidor.

---

## 9. Requisitos no funcionales

**Arquitectura.** Monorepo pnpm + Turborepo con dos aplicaciones (`api`, `web`) y dos paquetes compartidos (`db`, `shared`). Cada módulo de la API sigue el mismo patrón de archivos: rutas, servicio, esquema y definición OpenAPI. Esa uniformidad es deliberada: agregar un módulo nuevo no requiere decidir cómo estructurarlo.

**Fuente única de verdad de tipos.** Los esquemas Zod de `@gestor/shared` validan las peticiones en la API, generan la especificación OpenAPI, tipan las respuestas y alimentan los formularios del panel. Un cambio de contrato rompe la compilación en ambos extremos, que es exactamente lo que se busca.

**Seguridad.**
- Cabeceras endurecidas con Helmet.
- CORS restringido al origen del panel para `/api`, con política separada y explícita para las superficies MCP y OAuth.
- Contraseñas con bcrypt; tokens y códigos OAuth persistidos hasheados.
- Tokens segmentados por audiencia (`web` 7 días, `api` 5 minutos, recurso MCP 15 minutos) con el menor privilegio y la menor vida útil viable en cada caso.
- Validación estricta de entrada en todos los endpoints antes de tocar la base de datos.

**Rendimiento.** Toda lista potencialmente grande está paginada con tope de 100 elementos. Las métricas del dashboard se resuelven con agregaciones en base de datos, no en memoria. El panel cachea y revalida con TanStack Query, y el gráfico se carga de forma diferida.

**Despliegue.** PostgreSQL por Docker Compose en desarrollo (publicado en el puerto `55432` del host para no chocar con instalaciones locales). Configuración por variables de entorno validadas al arrancar: si falta una, el proceso no levanta. La URL pública se infiere automáticamente en Railway.

**Requisitos de entorno.** Node.js 20 o superior, pnpm 10.5.2, Docker para la base de datos local.

---

## 10. Criterios de aceptación de v1

- [x] Un usuario inicia sesión y llega al dashboard con datos reales.
- [x] Una venta de varios productos descuenta el stock exacto y genera un movimiento de salida por línea.
- [x] Vender más unidades de las disponibles se rechaza sin modificar nada, detallando los faltantes.
- [x] Cancelar una venta restituye el stock y deja movimientos de entrada trazables.
- [x] Un producto que baja de su mínimo aparece en las alertas del dashboard y en el listado de stock bajo.
- [x] Eliminar un producto vendido no rompe el historial de ventas.
- [x] Un usuario sin rol administrador recibe 403 al intentar editar o eliminar catálogo.
- [x] Swagger UI permite ejercitar todos los endpoints tras iniciar sesión.
- [x] Un host MCP completa el flujo OAuth y ejecuta las herramientas de consulta y operación.
- [x] El seed deja el sistema demostrable: catálogo y 100 ventas repartidas en seis meses.

---

## 11. Backlog y brechas conocidas

Ordenado por lo que más limita hoy el uso real del producto.

| ID | Brecha | Impacto | Prioridad |
|----|--------|---------|-----------|
| B1 | No hay gestión de usuarios. El rol `seller` funciona en el control de acceso pero no existe forma de crear un vendedor fuera del seed. | El producto no puede usarse con más de una persona. Bloquea el caso multi-vendedor, que es el que justifica los roles. | Alta |
| B2 | Sin cambio ni recuperación de contraseña. | La contraseña inicial es permanente. | Alta |
| B3 | Crear productos y categorías, y cancelar ventas, solo exigen sesión, no rol administrador, mientras editar y eliminar sí lo exigen. | Incoherencia en el modelo de permisos: un vendedor podría cancelar ventas o alterar el catálogo. | Alta |
| B4 | Sin pruebas automatizadas. | La lógica transaccional de ventas e inventario, que es la parte crítica, solo se verifica a mano. | Alta |
| B5 | Sin límite de intentos en el login. | Expone el endpoint a fuerza bruta. | Media |
| B6 | El listado de ventas no admite búsqueda por código ni por cliente. La herramienta MCP `search` compensa filtrando en memoria sobre la primera página, lo que no escala. | Encontrar una venta concreta exige recorrer páginas. | Media |
| B7 | El impuesto se modela y persiste, pero el punto de venta lo envía fijo en cero. | No se puede operar con IGV o equivalente. | Media |
| B8 | Sin comprobante imprimible ni exportación a PDF o CSV. | No hay entregable para el cliente ni para el contador. | Media |
| B9 | La cookie de sesión usa `SameSite=Lax`, lo que obliga a servir panel y API bajo el mismo dominio. | Restringe las topologías de despliegue. Mitigado por el proxy del panel. | Media |
| B10 | Los cortes de día y mes del dashboard usan la zona horaria del servidor. | Métricas desplazadas si el servidor no está en la zona del negocio. | Media |
| B11 | La numeración de ventas se serializa con un advisory lock global. | Correcto pero con un único escritor a la vez; limitaría el rendimiento con muchas cajas simultáneas. | Baja |
| B12 | Sin rotación de refresh token para la sesión web. | Una cookie robada sirve siete días. | Baja |
| B13 | Sin reportes por rango arbitrario, por vendedor ni por método de pago. | Análisis limitado a lo que muestra el dashboard. | Baja |

---

## 12. Roadmap propuesto

**Siguiente iteración — Operación multiusuario.** Cerrar B1, B2 y B3: alta de usuarios, cambio de contraseña y una matriz de permisos coherente por rol. Sin esto el producto sigue siendo de un solo operador, que contradice su propio diseño.

**Iteración 2 — Confianza.** B4 y B5: pruebas de integración sobre las transacciones de venta, cancelación y ajuste de inventario, más limitación de intentos en autenticación.

**Iteración 3 — Cierre del ciclo de venta.** B7 y B8: impuesto configurable y comprobante imprimible o exportable.

**Iteración 4 — Análisis.** B6 y B13: búsqueda de ventas en el servidor y reportes por rango, vendedor y método de pago.
