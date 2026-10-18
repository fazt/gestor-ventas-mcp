"use client";

import dynamic from "next/dynamic";
import { AlertTriangle, Banknote, PackageX, Percent, Receipt } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDashboardSummary, useSalesChart, useTopProducts } from "@/hooks/use-dashboard";
import { useLowStock } from "@/hooks/use-inventory";
import { formatMoney } from "@/lib/money";

const SalesChart = dynamic(
  () => import("@/components/sales-chart").then((m) => m.SalesChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

export default function DashboardPage() {
  const summary = useDashboardSummary();
  const chart = useSalesChart(30);
  const top = useTopProducts(30);
  const low = useLowStock();

  const s = summary.data;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Ventas del día y del mes, margen, ticket promedio y alertas de stock."
        actions={
          <Button variant="outline" asChild>
            <Link href="/reportes">Ver reportes</Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Ventas de hoy"
          value={s ? formatMoney(s.todayTotal) : "—"}
          hint={s ? `${s.todayCount} tickets` : undefined}
          icon={Banknote}
        />
        <StatCard
          title="Ventas del mes"
          value={s ? formatMoney(s.monthTotal) : "—"}
          hint={s ? `${s.monthCount} tickets` : undefined}
          icon={Receipt}
        />
        <StatCard
          title="Ticket promedio"
          value={s ? formatMoney(s.averageTicket) : "—"}
          icon={Banknote}
        />
        <StatCard
          title="Margen bruto del mes"
          value={s ? formatMoney(s.monthGrossMargin) : "—"}
          hint={s ? `${s.monthMarginPercent}% sobre ventas` : undefined}
          icon={Percent}
        />
        <StatCard
          title="Bajo stock"
          value={s ? String(s.lowStockCount) : String(low.data?.length ?? "—")}
          icon={PackageX}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ventas (30 días)</CardTitle>
          </CardHeader>
          <CardContent>
            {chart.isLoading ? <Skeleton className="h-64 w-full" /> : <SalesChart data={chart.data ?? []} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Más vendidos (30 días)</CardTitle>
          </CardHeader>
          <CardContent>
            {top.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : !top.data?.length ? (
              <p className="text-sm text-muted-foreground">Aún no hay ventas.</p>
            ) : (
              <ul className="grid gap-3">
                {top.data.map((item) => (
                  <li key={item.productId} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.quantitySold} uds.</p>
                    </div>
                    <span className="font-medium">{formatMoney(item.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Alertas de stock bajo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Mínimo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(low.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Todo el inventario está por encima del mínimo.
                  </TableCell>
                </TableRow>
              ) : (
                (low.data ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/productos?buscar=${encodeURIComponent(p.sku)}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>{p.sku}</TableCell>
                    <TableCell>
                      <Badge variant="warning">{p.stock}</Badge>
                    </TableCell>
                    <TableCell>{p.minStock}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
