export function authorizePage(opts: {
  error?: string;
  clientName: string;
  query: Record<string, string>;
}): string {
  const hidden = Object.entries(opts.query)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`,
    )
    .join("\n");

  const error = opts.error
    ? `<p class="error">${escapeHtml(opts.error)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Autorizar MCP</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; }
      main { max-width: 420px; margin: 10vh auto; padding: 24px; background: #1e293b; border-radius: 12px; }
      h1 { font-size: 1.25rem; margin: 0 0 8px; }
      p { color: #94a3b8; }
      label { display: block; margin: 12px 0 4px; font-size: 0.875rem; }
      input[type="email"], input[type="password"] {
        width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px;
        border: 1px solid #334155; background: #0f172a; color: #e2e8f0;
      }
      button { margin-top: 16px; width: 100%; padding: 10px; border: 0; border-radius: 8px;
        background: #2563eb; color: white; font-weight: 600; cursor: pointer; }
      .error { color: #fca5a5; }
    </style>
  </head>
  <body>
    <main>
      <h1>Conectar MCP</h1>
      <p>El cliente <strong>${escapeHtml(opts.clientName)}</strong> pide acceso al gestor de ventas.</p>
      ${error}
      <form method="post" action="/oauth/authorize">
        ${hidden}
        <label>Correo</label>
        <input type="email" name="email" required autocomplete="username" />
        <label>Contraseña</label>
        <input type="password" name="password" required autocomplete="current-password" />
        <button type="submit">Iniciar sesión y autorizar</button>
      </form>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
