"use client";

import * as React from "react";
import { format, startOfMonth } from "date-fns";
import { Banknote, Download, Percent, Receipt, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReport } from "@/hooks/use-dashboard";
import { ApiError, downloadFile, toQuery } from "@/lib/api";
import { formatMoney, parseMoney } from "@/lib/money";
import { PAYMENT_LABELS } from "@/lib/types";

function today(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function Breakdown({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{ key: string | number; label: string; count: number; total: string }>;
  empty: string;
}) {
  const grand = rows.reduce((sum, row) => sum + parseMoney(row.total), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-28">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const pct = grand > 0 ? Math.round((parseMoney(row.total) / grand) * 100) : 0;
                return (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.total)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded bg-muted" aria-hidden>
                          <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const [from, setFrom] = React.useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = React.useState(today);
  const invalid = Boolean(from && to && from > to);
  const report = useReport(from, to);
  const r = report.data;

  async function exportCsv() {
    try {
      await downloadFile(`/api/sales/export.csv${toQuery({ from, to })}`, `ventas-${from}-${to}.csv`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo exportar");
    }
  }

  return (
    <div>
      <PageHeader
        title="Reportes"
        description="Ventas por rango de fechas: totales, margen y desglose por método de pago, vendedor y categoría."
        actions={
          <Button variant="outline" onClick={() => void exportCsv()} disabled={invalid}>
            <Download className="h-4 w-4" />
            Exportar ventas del rango
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="from">Desde</Label>
          <Input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">Hasta</Label>
          <Input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
        {invalid ? <p className="pb-2 text-sm text-destructive">La fecha inicial es posterior a la final.</p> : null}
      </div>

      {report.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : report.isError ? (
        <p className="text-sm text-destructive">No se pudo cargar el reporte.</p>
      ) : r ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Ventas netas" value={formatMoney(r.totals.total)} hint={`${r.totals.count} tickets`} icon={Banknote} />
            <StatCard title="Ticket promedio" value={formatMoney(r.totals.averageTicket)} icon={Receipt} />
            <StatCard
              title="Margen bruto"
              value={formatMoney(r.totals.grossMargin)}
              hint={`Costo ${formatMoney(r.totals.cost)} · descuentos ${formatMoney(r.totals.discount)}`}
              icon={Percent}
            />
            <StatCard
              title="Canceladas"
              value={String(r.cancelled.count)}
              hint={`${formatMoney(r.cancelled.total)} anulados`}
              icon={XCircle}
            />
          </div>
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <Breakdown
              title="Por método de pago"
              empty="Sin ventas en el rango."
              rows={r.byPaymentMethod.map((row) => ({
                key: row.paymentMethod,
                label: PAYMENT_LABELS[row.paymentMethod] ?? row.paymentMethod,
                count: row.count,
                total: row.total,
              }))}
            />
            <Breakdown
              title="Por vendedor"
              empty="Sin ventas en el rango."
              rows={r.bySeller.map((row) => ({ key: row.userId, label: row.userName, count: row.count, total: row.total }))}
            />
            <Breakdown
              title="Por categoría (unidades)"
              empty="Sin ventas en el rango."
              rows={r.byCategory.map((row) => ({
                key: row.categoryId,
                label: row.categoryName,
                count: row.quantity,
                total: row.total,
              }))}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
