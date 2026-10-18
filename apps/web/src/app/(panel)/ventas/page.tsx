"use client";

import * as React from "react";
import type { Sale } from "@gestor/shared";
import { format } from "date-fns";
import { Download, Plus, Search } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSales } from "@/hooks/use-sales";
import { ApiError, downloadFile, toQuery } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { PAYMENT_LABELS, SALE_STATUS_LABELS } from "@/lib/types";

type Status = "completed" | "cancelled";
type Method = "cash" | "card" | "transfer" | "yape";

export default function SalesPage() {
  const [status, setStatus] = React.useState("all");
  const [method, setMethod] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = {
    status: status === "all" ? undefined : (status as Status),
    paymentMethod: method === "all" ? undefined : (method as Method),
    from: from || undefined,
    to: to || undefined,
    search: debounced || undefined,
  };
  const rangeInvalid = Boolean(from && to && from > to);

  const { data, isLoading, isError } = useSales({ page, pageSize: 20, ...filters });

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadFile(`/api/sales/export.csv${toQuery(filters)}`, "ventas.csv");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo exportar");
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<Sale>[] = [
    {
      id: "code",
      header: "Código",
      cell: (row) => (
        <Link href={`/ventas/${row.id}`} className="font-medium text-primary hover:underline">
          {row.code}
        </Link>
      ),
    },
    { id: "customer", header: "Cliente", cell: (row) => row.customerName || "Mostrador" },
    { id: "date", header: "Fecha", cell: (row) => format(new Date(row.createdAt), "dd/MM/yyyy HH:mm") },
    { id: "seller", header: "Vendedor", cell: (row) => row.sellerName ?? "—" },
    { id: "payment", header: "Pago", cell: (row) => PAYMENT_LABELS[row.paymentMethod] ?? row.paymentMethod },
    { id: "total", header: "Total", className: "text-right", cell: (row) => formatMoney(row.total) },
    {
      id: "status",
      header: "Estado",
      cell: (row) => (
        <Badge variant={row.status === "completed" ? "success" : "secondary"}>
          {SALE_STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
  ];

  const resetPage = () => setPage(1);

  return (
    <div>
      <PageHeader
        title="Ventas"
        description="Historial con búsqueda, filtros y exportación a CSV."
        actions={
          <>
            <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || rangeInvalid}>
              <Download className="h-4 w-4" />
              {exporting ? "Exportando…" : "Exportar CSV"}
            </Button>
            <Button asChild>
              <Link href="/ventas/nueva">
                <Plus className="h-4 w-4" />
                Nueva venta
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Label htmlFor="sale-search" className="sr-only">
            Buscar
          </Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="sale-search"
            className="pl-9"
            placeholder="Código, cliente o documento"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Input
          type="date"
          aria-label="Desde"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            resetPage();
          }}
        />
        <Input
          type="date"
          aria-label="Hasta"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            resetPage();
          }}
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v ?? "all");
            resetPage();
          }}
        >
          <SelectTrigger aria-label="Estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="completed">Completadas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={method}
          onValueChange={(v) => {
            setMethod(v ?? "all");
            resetPage();
          }}
        >
          <SelectTrigger aria-label="Método de pago">
            <SelectValue placeholder="Método de pago" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los pagos</SelectItem>
            {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {rangeInvalid ? (
        <p className="mb-3 text-sm text-destructive">La fecha inicial no puede ser posterior a la final.</p>
      ) : null}
      {isError && !rangeInvalid ? (
        <p className="mb-3 text-sm text-destructive">No se pudieron cargar las ventas. Reintenta en unos segundos.</p>
      ) : null}
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        empty={debounced || from || to ? "Ninguna venta coincide con los filtros" : "Aún no hay ventas registradas"}
        rowKey={(r) => r.id}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? 20}
        total={data?.total}
        onPageChange={setPage}
      />
    </div>
  );
}
