type PageOptions = {
  clientName: string;
  redirectHost: string;
  query: Record<string, string>;
  storeName: string;
  error?: string;
};

const STYLE = `
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; }
  main { max-width: 440px; margin: 8vh auto; padding: 28px; background: #1e293b; border-radius: 14px; box-shadow: 0 10px 40px rgb(0 0 0 / 0.35); }
  @media (max-width: 480px) { main { margin: 0; min-height: 100vh; border-radius: 0; box-sizing: border-box; } }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  p, li { color: #94a3b8; line-height: 1.5; font-size: 0.925rem; }
  ul { padding-left: 1.1rem; margin: 8px 0 16px; }
  strong { color: #e2e8f0; }
  label { display: block; margin: 14px 0 6px; font-size: 0.875rem; }
  input[type="email"], input[type="password"] {
    width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px;
    border: 1px solid #334155; background: #0f172a; color: #e2e8f0; font-size: 1rem;
  }
  input:focus-visible, button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
  .actions { display: flex; gap: 10px; margin-top: 18px; }
  button { flex: 1; padding: 11px; border: 0; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.95rem; }
  .primary { background: #2563eb; color: white; }
  .secondary { background: transparent; color: #cbd5e1; border: 1px solid #475569; }
  .error { color: #fecaca; background: rgb(127 29 29 / 0.4); border-radius: 8px; padding: 8px 12px; }
  .brand { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: #60a5fa; margin-bottom: 4px; }
  .muted { font-size: 0.8rem; }
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hiddenFields(query: Record<string, string>): string {
  return Object.entries(query)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
    .join("\n        ");
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${escapeHtml(title)}</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <main>
      ${body}
    </main>
  </body>
</html>`;
}

function permissions(): string {
  return `<ul>
        <li>Consultar catálogo, ventas, inventario y métricas.</li>
        <li>Registrar o cancelar ventas y mover inventario en tu nombre.</li>
        <li>Editar el catálogo solo si tu cuenta es de administrador.</li>
      </ul>`;
}

/** Formulario de inicio de sesión + autorización (cuando no hay sesión en el panel). */
export function authorizePage(opts: PageOptions): string {
  const error = opts.error ? `<p class="error" role="alert">${escapeHtml(opts.error)}</p>` : "";
  return layout(
    "Conectar asistente",
    `<p class="brand">${escapeHtml(opts.storeName)}</p>
      <h1>Conectar ${escapeHtml(opts.clientName)}</h1>
      <p><strong>${escapeHtml(opts.clientName)}</strong> (${escapeHtml(opts.redirectHost)}) pide acceso al gestor de ventas. Podrá:</p>
      ${permissions()}
      ${error}
      <form method="post" action="/oauth/authorize">
        ${hiddenFields(opts.query)}
        <label for="email">Correo</label>
        <input id="email" type="email" name="email" required autocomplete="username" />
        <label for="password">Contraseña</label>
        <input id="password" type="password" name="password" required autocomplete="current-password" />
        <div class="actions">
          <button class="secondary" type="submit" name="decision" value="deny" formnovalidate>Cancelar</button>
          <button class="primary" type="submit" name="decision" value="allow">Iniciar sesión y autorizar</button>
        </div>
      </form>
      <p class="muted">Puedes revocar el acceso cerrando la sesión del asistente o cambiando tu contraseña.</p>`,
  );
}

/**
 * Pantalla de consentimiento cuando ya hay sesión en el panel. Antes se emitía el código
 * sin preguntar: cualquier cliente registrado dinámicamente podía obtener acceso con solo
 * abrir un enlace a un usuario con sesión iniciada.
 */
export function consentPage(opts: PageOptions & { userName: string; userEmail: string; csrf: string }): string {
  const error = opts.error ? `<p class="error" role="alert">${escapeHtml(opts.error)}</p>` : "";
  return layout(
    "Autorizar asistente",
    `<p class="brand">${escapeHtml(opts.storeName)}</p>
      <h1>¿Autorizar a ${escapeHtml(opts.clientName)}?</h1>
      <p>Has iniciado sesión como <strong>${escapeHtml(opts.userName)}</strong> (${escapeHtml(opts.userEmail)}).
      <strong>${escapeHtml(opts.clientName)}</strong> (${escapeHtml(opts.redirectHost)}) podrá:</p>
      ${permissions()}
      ${error}
      <form method="post" action="/oauth/authorize">
        ${hiddenFields(opts.query)}
        <input type="hidden" name="csrf" value="${escapeHtml(opts.csrf)}" />
        <div class="actions">
          <button class="secondary" type="submit" name="decision" value="deny">Cancelar</button>
          <button class="primary" type="submit" name="decision" value="allow">Autorizar</button>
        </div>
      </form>
      <p class="muted">Si no reconoces esta solicitud, pulsa Cancelar.</p>`,
  );
}

export function errorPage(message: string): string {
  return layout("Error de autorización", `<h1>No se pudo continuar</h1><p class="error">${escapeHtml(message)}</p>`);
}
