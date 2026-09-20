# TestSprite AI Testing Report (MCP)

---

## 1️⃣ Document Metadata

- **Project Name:** app-gestor-ventas
- **Version:** 0.1.0
- **Date:** 2026-09-20
- **Prepared by:** TestSprite AI Team
- **Test Type:** Frontend (end to end, navegador real contra el panel Next.js)
- **Target:** `http://localhost:3000` (panel en modo producción) sobre la API Express en `http://localhost:4000`
- **Scope:** codebase
- **Tests ejecutados:** 17 de los 50 casos del plan (subconjunto sin duplicados)

---

## 2️⃣ Requirement Validation Summary

### Requirement: Autenticación y arranque de sesión

- **Description:** Login con credenciales sembradas, validación de entrada y mensaje de error genérico ante credenciales incorrectas.

| Test ID | Nombre | Resultado |
|---------|--------|-----------|
| TC001 | Log in and reach the authenticated dashboard | ✅ Passed |
| TC021 | Show an error for invalid login credentials | ✅ Passed |
| TC045 | Validate malformed login input | ✅ Passed |

- **Test Code:** [TC001](./TC001_Log_in_and_reach_the_authenticated_dashboard.py) · [TC021](./TC021_Show_an_error_for_invalid_login_credentials.py) · [TC045](./TC045_Validate_malformed_login_input.py)
- **Analysis / Findings:** El flujo de login funciona de punta a punta. La cookie `token` se emite, el middleware la reconoce y el usuario aterriza en `/dashboard`. Las credenciales inválidas devuelven 401 y el panel muestra el toast "Credenciales inválidas" sin navegar. La validación de Zod bloquea el envío con un email malformado. Nota de diseño: el formulario llega precargado con `admin@ventas.com` / `admin123`, así que los tests de validación tuvieron que limpiar ambos campos antes de escribir.

---

### Requirement: Protección de rutas y cierre de sesión

- **Description:** El middleware de Next protege todas las rutas del panel leyendo la cookie `token` y conserva el destino original; el menú de usuario cierra la sesión.

| Test ID | Nombre | Resultado |
|---------|--------|-----------|
| TC007 | Redirect unauthenticated visitors away from protected pages | ✅ Passed |
| TC012 | Log out and lose access to protected pages | ✅ Passed |

- **Test Code:** [TC007](./TC007_Redirect_unauthenticated_visitors_away_from_protected_pages.py) · [TC012](./TC012_Log_out_and_lose_access_to_protected_pages.py)
- **Analysis / Findings:** Visitar `/dashboard` sin sesión redirige a `/login?from=/dashboard` conservando el destino. Tras cerrar sesión, volver a una ruta del panel vuelve a redirigir al login, confirmando que la cookie se limpia de verdad y no queda estado de sesión en el cliente.

---

### Requirement: Dashboard

- **Description:** Tarjetas de KPI, gráfico de 30 días, top de productos y alertas de stock bajo.

| Test ID | Nombre | Resultado |
|---------|--------|-----------|
| TC027 | View authenticated dashboard metrics and alerts | ✅ Passed |

- **Test Code:** [TC027](./TC027_View_authenticated_dashboard_metrics_and_alerts.py)
- **Analysis / Findings:** Las cuatro tarjetas de KPI, el gráfico de Recharts (cargado con `next/dynamic` y `ssr: false`) y las secciones de top de productos y stock bajo renderizan con datos reales del seed. El skeleton del gráfico se reemplaza correctamente por el contenido.

---

### Requirement: Catálogo de productos

- **Description:** Listado paginado con búsqueda por nombre o SKU, filtro por categoría, y alta y edición vía diálogo.

| Test ID | Nombre | Resultado |
|---------|--------|-----------|
| TC022 | Admin creates a new product and sees it in the catalog | ✅ Passed |
| TC031 | Admin edits an existing product and sees the updated catalog row | ✅ Passed |
| TC040 | Product search and category filtering narrow the catalog list | ✅ Passed |

- **Test Code:** [TC022](./TC022_Admin_creates_a_new_product_and_sees_it_in_the_catalog.py) · [TC031](./TC031_Admin_edits_an_existing_product_and_sees_the_updated_catalog_row.py) · [TC040](./TC040_Product_search_and_category_filtering_narrow_the_catalog_list.py)
- **Analysis / Findings:** El CRUD de productos responde bien. La búsqueda con debounce de 300 ms filtra por nombre y SKU, el filtro por categoría se combina con la búsqueda, y TanStack Query invalida el listado tras crear o editar, de modo que la tabla refleja el cambio sin recargar.

---

### Requirement: Categorías

- **Description:** Alta, renombrado y borrado de categorías con nombre único.

| Test ID | Nombre | Resultado |
|---------|--------|-----------|
| TC039 | Admin can create, rename, and delete a category | ✅ Passed |

- **Test Code:** [TC039](./TC039_Admin_can_create_rename_and_delete_a_category.py)
- **Analysis / Findings:** El ciclo completo crear → renombrar → eliminar funciona, incluyendo el diálogo de confirmación destructivo y los toasts de éxito.

---

### Requirement: Historial de ventas y cancelación

- **Description:** Listado con filtros de fecha y estado, detalle de venta y cancelación que repone stock.

| Test ID | Nombre | Resultado |
|---------|--------|-----------|
| TC034 | Sales history filters results by date range and status | ✅ Passed |
| TC009 | Cancel a completed sale and restore stock | ✅ Passed |

- **Test Code:** [TC034](./TC034_Sales_history_filters_results_by_date_range_and_status.py) · [TC009](./TC009_Cancel_a_completed_sale_and_restore_stock.py)
- **Analysis / Findings:** Los filtros por rango de fechas y por estado acotan el listado y la paginación se mantiene. La cancelación de una venta completada funciona correctamente: la venta pasa a "Cancelada", el botón de cancelar desaparece y el stock se repone con movimientos `in`, tal como define `cancelSale`.

---

### Requirement: Punto de venta

- **Description:** Búsqueda de productos, armado del carrito, validación de stock y cobro.

| Test ID | Nombre | Resultado |
|---------|--------|-----------|
| TC014 | Prevent checkout when stock is insufficient | ✅ Passed |
| TC026 | Block checkout with an empty cart | ✅ Passed |
| TC004 | Create a new sale from active products | ❌ **Failed** |

- **Test Code:** [TC014](./TC014_Prevent_checkout_when_stock_is_insufficient.py) · [TC026](./TC026_Block_checkout_with_an_empty_cart.py) · [TC004](./TC004_Create_a_new_sale_from_active_products.py)
- **Test Error (TC004):** Tras más de 9 intentos con distintos clientes, documentos y combinaciones de productos, el cobro siempre devolvió el toast `El registro viola una restricción de unicidad` y nunca se llegó a la página de detalle de la venta.
- **Analysis / Findings:** **Bug real y crítico, ya corregido.** Las validaciones defensivas del carrito (stock insuficiente y carrito vacío) funcionan, pero **ninguna venta podía registrarse**.

  Causa raíz en `nextSaleCode` (`apps/api/src/modules/sales/sales.service.ts`): el código de la siguiente venta se derivaba de la última fila por `id DESC`. La base tenía `V-000001`…`V-000004` en los ids 1–4 y luego el seed insertó `V-DEMO-01`…`V-DEMO-100` en los ids 5–104. Por lo tanto la última fila era `V-DEMO-100`, `Number("DEMO-100")` daba `NaN`, y la función caía al fallback `"V-000001"`, un código que ya existía. El índice único sobre `sales.code` rechazaba cada inserción, de forma permanente.

  **Corrección aplicada:** la consulta ahora ignora los códigos que no pertenecen a la secuencia y toma el mayor `V-<número>` real:

  ```sql
  WHERE code ~ '^V-[0-9]+$'
  ORDER BY CAST(SUBSTRING(code FROM 3) AS BIGINT) DESC
  ```

  **Verificado:** tres ventas consecutivas por API devuelven `201` con los códigos `V-000005`, `V-000006` y `V-000007`, retomando correctamente la secuencia después de `V-000004`.

---

### Requirement: Inventario y movimientos de stock

- **Description:** Stock actual, formulario de entrada o ajuste auditado, e historial de movimientos filtrable.

| Test ID | Nombre | Resultado |
|---------|--------|-----------|
| TC018 | Register a manual inventory adjustment | ✅ Passed |
| TC050 | Show validation for an invalid inventory adjustment | ❌ **Failed** |

- **Test Code:** [TC018](./TC018_Register_a_manual_inventory_adjustment.py) · [TC050](./TC050_Show_validation_for_an_invalid_inventory_adjustment.py)
- **Test Error (TC050):** El formulario aceptó un ajuste de cantidad 100 sobre un producto con stock 8 en lugar de rechazarlo. Apareció el toast "Movimiento registrado" y el historial registró la transición `8 → 100`.
- **Analysis / Findings:** **Falso positivo, no es un bug.** El caso asumió que "Cantidad" siempre suma un delta y que 100 sobre un stock de 8 es inválido. En realidad `adjustStock` distingue dos tipos: `in` **suma** la cantidad al stock, mientras que `adjustment` **fija** el stock a ese valor absoluto. Poner el stock en 100 es la operación esperada, y el movimiento se auditó correctamente con la diferencia absoluta.

  Dicho esto, el fallo expone una **ambigüedad de interfaz legítima**: el formulario usa la misma etiqueta "Cantidad" para dos semánticas opuestas y nada en pantalla lo aclara. Si un agente de pruebas se confunde, un usuario también puede hacerlo. Ver la recomendación en la sección 4.

---

## 3️⃣ Coverage & Matching Metrics

- **17** casos ejecutados de los **50** generados en el plan
- **15** pasaron, **2** fallaron → **88.24 %** de aprobación
- **1** fallo corresponde a un defecto real de producto (corregido), **1** a una expectativa incorrecta del test

| Requirement | Total Tests | ✅ Passed | ❌ Failed |
|-------------|-------------|-----------|-----------|
| Autenticación y arranque de sesión | 3 | 3 | 0 |
| Protección de rutas y cierre de sesión | 2 | 2 | 0 |
| Dashboard | 1 | 1 | 0 |
| Catálogo de productos | 3 | 3 | 0 |
| Categorías | 1 | 1 | 0 |
| Historial de ventas y cancelación | 2 | 2 | 0 |
| Punto de venta | 3 | 2 | 1 |
| Inventario y movimientos de stock | 2 | 1 | 1 |
| **Total** | **17** | **15** | **2** |

### Casos no ejecutados

De los 50 casos del plan se excluyeron 33: la mayoría eran duplicados literales de los flujos anteriores (por ejemplo TC002, TC005 y TC016 repiten el mismo checkout del punto de venta; TC023, TC024 y TC025 repiten la misma lectura de inventario). Además se descartaron **TC033, TC046 y TC048**, que asumen un usuario con rol `seller`: el seed solo crea el administrador, de modo que habrían fallado por falta de datos y no por un defecto del código.

---

## 4️⃣ Key Gaps / Risks

1. **[Crítico — corregido] El punto de venta estaba completamente inoperativo.** Ninguna venta podía registrarse por la colisión de códigos descrita en TC004. Es el hallazgo más importante de la corrida y pasó inadvertido en local porque solo se manifiesta cuando conviven ventas sembradas (`V-DEMO-*`) con ventas reales. **Riesgo residual:** conviene añadir una prueba de regresión que cree dos ventas seguidas partiendo de una base con datos de seed, y valorar mover la numeración a una secuencia de PostgreSQL en lugar de derivarla leyendo la última fila.

2. **[Alto] La configuración por defecto del panel impide cualquier prueba end to end remota.** `apps/web/.env.local` fija `NEXT_PUBLIC_API_URL=http://localhost:4000`, así que el navegador llama a la API cross-origin. En local funciona solo porque las cookies ignoran el puerto y `localhost:4000` comparte dominio con `localhost:3000`. Detrás de un túnel, en staging o en cualquier host distinto, la cookie de sesión nunca viaja y todo falla en el login. Para esta corrida se compiló el panel en producción con `NEXT_PUBLIC_API_URL` vacío para que use el proxy mismo-origen `/api/[...path]`. **Recomendación:** adoptar el proxy como configuración por defecto también en desarrollo.

3. **[Medio] El formulario de inventario usa "Cantidad" con dos significados opuestos.** Con tipo "Entrada" suma al stock y con tipo "Ajuste" lo reemplaza por un valor absoluto, sin ninguna indicación en pantalla. Esto provocó el falso fallo de TC050 y es un riesgo claro de error operativo. **Recomendación:** cambiar la etiqueta dinámicamente, por ejemplo "Cantidad a ingresar" frente a "Nuevo stock".

4. **[Medio] No existe un usuario con rol `seller` en el seed.** Toda la lógica de permisos de `requireRole("admin")` queda sin cobertura: las ramas 403 no se pueden ejercitar y los tres casos de rol del plan son inejecutables. **Recomendación:** añadir un vendedor al seed.

5. **[Medio] Asimetría de permisos en la API.** `POST /api/products` y `POST /api/categories` no aplican `requireRole("admin")`, mientras que `PUT` y `DELETE` sí. Cualquier usuario autenticado puede crear catálogo. Si es intencional conviene documentarlo; si no, es un hueco de autorización.

6. **[Bajo] El formulario de login viene precargado con las credenciales de administrador.** Es cómodo para la demo, pero debería quedar fuera de cualquier build de producción.

7. **[Bajo] El campo "Descuento" del punto de venta no valida la entrada.** Es un input de texto libre y `parseMoney` convierte silenciosamente cualquier texto no numérico en 0, sin avisar al usuario.

8. **[Informativo] El plan de pruebas de backend está limitado a 1 caso en el plan Free.** El generador de backend devolvió un único caso en unos 2 segundos, frente a los 50 casos del plan de frontend. Para cubrir la API directamente (contratos de error, códigos de estado, validaciones de Zod) haría falta un plan de pago o pruebas de integración propias.
