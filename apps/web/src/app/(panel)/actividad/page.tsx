"use client";

import * as React from "react";
import type { McpAuditLog } from "@gestor/shared";
import { format } from "date-fns";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/hooks/use-auth";
import { useMcpActivity } from "@/hooks/use-team";
import { TOOL_LABELS } from "@/lib/types";

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "—";
  const entries = Object.entries(args as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return "—";
  const text = entries
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export default function ActivityPage() {
  const { data: me } = useMe();
  const [page, setPage] = React.useState(1);
  const [tool, setTool] = React.useState("all");
  const [result, setResult] = React.useState("all");

  const activity = useMcpActivity({
    page,
    pageSize: 25,
    tool: tool === "all" ? undefined : tool,
    ok: result === "all" ? undefined : (result as "true" | "false"),
  });

  const columns: Column<McpAuditLog>[] = [
    { id: "date", header: "Fecha", cell: (row) => format(new Date(row.createdAt), "dd/MM/yyyy HH:mm:ss") },
    ...(me?.user.role === "admin"
      ? [{ id: "user", header: "Usuario", cell: (row: McpAuditLog) => row.userName ?? "—" } satisfies Column<McpAuditLog>]
      : []),
    {
      id: "via",
      header: "Conexión",
      cell: (row) => <Badge variant="outline">{row.authKind === "pat" ? "Token personal" : "OAuth"}</Badge>,
    },
    {
      id: "tool",
      header: "Acción",
      cell: (row) => (
        <div>
          <p className="font-medium">{TOOL_LABELS[row.tool] ?? row.tool}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.tool}</p>
        </div>
      ),
    },
    {
      id: "args",
      header: "Argumentos",
      cell: (row) => <span className="text-xs text-muted-foreground">{summarizeArgs(row.args)}</span>,
    },
    {
      id: "result",
      header: "Resultado",
      cell: (row) =>
        row.ok ? (
          <Badge variant="success">OK</Badge>
        ) : (
          <div className="grid gap-1">
            <Badge variant="destructive">Error</Badge>
            {row.error ? <span className="text-xs text-muted-foreground">{row.error}</span> : null}
          </div>
        ),
    },
    { id: "ms", header: "ms", className: "text-right", cell: (row) => row.durationMs },
  ];

  return (
    <div>
      <PageHeader
        title="Actividad de asistentes IA"
        description={
          me?.user.role === "admin"
            ? "Cada acción que un asistente hizo vía MCP en nombre de tu equipo."
            : "Cada acción que un asistente hizo vía MCP con tu cuenta."
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          value={tool}
          onValueChange={(v) => {
            setTool(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56" aria-label="Acción">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las acciones</SelectItem>
            {Object.entries(TOOL_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={result}
          onValueChange={(v) => {
            setResult(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Resultado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="true">Correctas</SelectItem>
            <SelectItem value="false">Con error</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        columns={columns}
        data={activity.data?.data ?? []}
        loading={activity.isLoading}
        empty="Todavía no hay actividad. Conecta un asistente desde Integraciones IA."
        rowKey={(row) => row.id}
        page={activity.data?.page ?? page}
        pageSize={activity.data?.pageSize ?? 25}
        total={activity.data?.total}
        onPageChange={setPage}
      />
    </div>
  );
}
