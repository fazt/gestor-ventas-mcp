"use client";

import * as React from "react";
import type { ApiToken, ApiTokenScope, CreatedApiToken } from "@gestor/shared";
import { format } from "date-fns";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiTokens, useCreateApiToken, useRevokeApiToken } from "@/hooks/use-team";
import { ApiError } from "@/lib/api";

function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar: selecciona el texto manualmente");
    }
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-label={label}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copiado" : label}
    </Button>
  );
}

function Snippet({ title, description, code }: { title: string; description: string; code: string }) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <CopyButton value={code} />
      </div>
      <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function tokenStatus(token: ApiToken): { label: string; variant: "success" | "secondary" | "warning" } {
  if (token.revokedAt) return { label: "Revocado", variant: "secondary" };
  if (token.expiresAt && new Date(token.expiresAt).getTime() < Date.now()) return { label: "Vencido", variant: "warning" };
  return { label: "Activo", variant: "success" };
}

export default function IntegrationsPage() {
  const tokens = useApiTokens();
  const create = useCreateApiToken();
  const revoke = useRevokeApiToken();

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("Claude Code");
  const [access, setAccess] = React.useState<"read" | "write">("read");
  const [days, setDays] = React.useState("90");
  const [created, setCreated] = React.useState<CreatedApiToken | null>(null);
  const [toRevoke, setToRevoke] = React.useState<ApiToken | null>(null);

  const mcpUrl = tokens.data?.mcpUrl ?? "https://tu-dominio/mcp";
  const shownToken = created?.token ?? "gv_TU_TOKEN";

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    const scopes: ApiTokenScope[] = access === "write" ? ["read", "write"] : ["read"];
    try {
      const result = await create.mutateAsync({
        name: name.trim(),
        scopes,
        expiresInDays: days === "never" ? null : Number(days),
      });
      setCreated(result);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo crear el token");
    }
  }

  const columns: Column<ApiToken>[] = [
    {
      id: "name",
      header: "Nombre",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.tokenPrefix}…</p>
        </div>
      ),
    },
    {
      id: "scopes",
      header: "Permisos",
      cell: (row) => (
        <Badge variant="outline">{row.scopes.includes("write") ? "Lectura y escritura" : "Solo lectura"}</Badge>
      ),
    },
    {
      id: "used",
      header: "Último uso",
      cell: (row) => (row.lastUsedAt ? format(new Date(row.lastUsedAt), "dd/MM/yyyy HH:mm") : "Nunca"),
    },
    {
      id: "expires",
      header: "Vence",
      cell: (row) => (row.expiresAt ? format(new Date(row.expiresAt), "dd/MM/yyyy") : "Sin vencimiento"),
    },
    {
      id: "status",
      header: "Estado",
      cell: (row) => {
        const status = tokenStatus(row);
        return <Badge variant={status.variant}>{status.label}</Badge>;
      },
    },
    {
      id: "actions",
      header: "",
      className: "w-16 text-right",
      cell: (row) =>
        row.revokedAt ? null : (
          <Button variant="ghost" size="icon" onClick={() => setToRevoke(row)} aria-label={`Revocar ${row.name}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        ),
    },
  ];

  const claudeCode = `claude mcp add --transport http gestor-ventas ${mcpUrl} \\\n  --header "Authorization: Bearer ${shownToken}"`;
  const claudeDesktop = JSON.stringify(
    {
      mcpServers: {
        "gestor-ventas": {
          command: "npx",
          args: ["-y", "mcp-remote", mcpUrl, "--header", "Authorization:${GESTOR_TOKEN}"],
          env: { GESTOR_TOKEN: `Bearer ${shownToken}` },
        },
      },
    },
    null,
    2,
  );
  const cursor = JSON.stringify(
    { mcpServers: { "gestor-ventas": { url: mcpUrl, headers: { Authorization: `Bearer ${shownToken}` } } } },
    null,
    2,
  );

  return (
    <div>
      <PageHeader
        title="Integraciones con IA"
        description="Conecta Claude, ChatGPT, Cursor o tus scripts al gestor mediante el servidor MCP."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Nuevo token
          </Button>
        }
      />

      {created ? (
        <Card className="mb-6 border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" />
              Token creado: {created.name}
            </CardTitle>
            <CardDescription>Cópialo ahora: por seguridad no se vuelve a mostrar.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">{created.token}</code>
            <div className="flex gap-2">
              <CopyButton value={created.token} label="Copiar token" />
              <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
                Listo
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <h2 className="mb-3 text-lg font-semibold">Mis tokens</h2>
          <DataTable
            columns={columns}
            data={tokens.data?.data ?? []}
            loading={tokens.isLoading}
            empty="Aún no creaste tokens. Crea uno para conectar Claude Code o Claude Desktop."
            rowKey={(row) => row.id}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Cada token actúa con tu usuario y tu rol. Un token de solo lectura no puede registrar ventas ni mover
            inventario. Las acciones quedan en Actividad IA.
          </p>
        </div>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Cómo conectar</CardTitle>
            <CardDescription>
              URL del servidor MCP: <code className="break-all">{mcpUrl}</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Snippet title="Claude Code" description="En la terminal del proyecto" code={claudeCode} />
            <Snippet
              title="Claude Desktop"
              description="claude_desktop_config.json (usa mcp-remote como puente)"
              code={claudeDesktop}
            />
            <Snippet title="Cursor" description=".cursor/mcp.json" code={cursor} />
            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Claude.ai, ChatGPT y clientes con OAuth</p>
              Agrega un conector personalizado con la URL de arriba (HTTPS público). El cliente abrirá una pantalla
              de inicio de sesión y consentimiento; no hace falta token.
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={(e) => void onCreate(e)} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Nuevo token personal</DialogTitle>
              <DialogDescription>Ponle un nombre que identifique dónde lo vas a usar.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="token-name">Nombre</Label>
              <Input
                id="token-name"
                value={name}
                minLength={2}
                maxLength={100}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Permisos</Label>
              <Select value={access} onValueChange={(v) => setAccess(v === "write" ? "write" : "read")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Solo lectura (consultas y reportes)</SelectItem>
                  <SelectItem value="write">Lectura y escritura (vender, mover inventario)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Vencimiento</Label>
              <Select value={days} onValueChange={(v) => setDays(v ?? "90")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 días</SelectItem>
                  <SelectItem value="30">30 días</SelectItem>
                  <SelectItem value="90">90 días</SelectItem>
                  <SelectItem value="365">1 año</SelectItem>
                  <SelectItem value="never">Sin vencimiento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending || name.trim().length < 2}>
                {create.isPending ? "Creando…" : "Crear token"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toRevoke)}
        onOpenChange={(v) => !v && setToRevoke(null)}
        title="Revocar token"
        description={`“${toRevoke?.name}” dejará de funcionar de inmediato en todos los clientes que lo usen.`}
        confirmLabel="Revocar"
        destructive
        onConfirm={async () => {
          if (!toRevoke) return;
          try {
            await revoke.mutateAsync(toRevoke.id);
            toast.success("Token revocado");
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo revocar");
            throw error;
          }
        }}
      />
    </div>
  );
}
