"use client";

import * as React from "react";
import type { Sale } from "@gestor/shared";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSales } from "@/hooks/use-sales";
import { formatMoney } from "@/lib/money";
import { PAYMENT_LABELS, SALE_STATUS_LABELS } from "@/lib/types";

export default function SalesPage() {
  const [status, setStatus] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);

  const { data, isLoading } = useSales({
    page,
    pageSize: 20,
    status: status === "all" ? undefined : (status as "completed" | "cancelled"),
    from: from || undefined,
    to: to || undefined,
  });

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
    {
      id: "customer",
      header: "Cliente",
      cell: (row) => row.customerName || "Mostrador",
    },
    {
      id: "date",
      header: "Fecha",
      cell: (row) => format(new Date(row.createdAt), "dd/MM/yyyy HH:mm"),
    },
    {
      id: "payment",
      header: "Pago",
      cell: (row) => PAYMENT_LABELS[row.paymentMethod] ?? row.paymentMethod,
    },
    {
      id: "total",
      header: "Total",
      cell: (row) => formatMoney(row.total),
    },
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

  return (
    <div>
      <PageHeader
        title="Ventas"
        description="Historial con filtros por fecha y estado."
        actions={
          <Button asChild>
            <Link href="/ventas/nueva">
              <Plus className="h-4 w-4" />
              Nueva venta
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        <Select value={status} onValueChange={(v) => { setStatus(v ?? "all"); setPage(1); }}>
          <SelectTrigger>
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="completed">Completadas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r.id}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? 20}
        total={data?.total}
        onPageChange={setPage}
      />
    </div>
  );
}
