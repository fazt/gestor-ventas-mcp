"use client";

import { format } from "date-fns";
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/use-auth";
import { useStoreSettings } from "@/hooks/use-dashboard";
import { useCancelSale, useSale } from "@/hooks/use-sales";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { PAYMENT_LABELS, SALE_STATUS_LABELS } from "@/lib/types";

function isSameLocalDay(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const saleId = Number(id);
  const { data, isLoading, isError } = useSale(saleId);
  const { data: me } = useMe();
  const { data: settings } = useStoreSettings();
  const cancel = useCancelSale();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="font-medium">No se encontró la venta.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/ventas">Volver al historial</Link>
        </Button>
      </div>
    );
  }

  // Misma regla que la API: admin siempre; vendedor solo lo suyo y del día.
  const canCancel =
    data.status === "completed" &&
    (me?.user.role === "admin" || (me?.user.id === data.userId && isSameLocalDay(data.createdAt)));

  async function confirmCancel() {
    if (!data) return;
    try {
      await cancel.mutateAsync({ id: data.id, reason: reason.trim() || undefined });
      toast.success("Venta cancelada y stock repuesto");
      setOpen(false);
      setReason("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo cancelar");
    }
  }

  return (
    <div>
      <PageHeader
        title={data.code}
        description={format(new Date(data.createdAt), "dd/MM/yyyy HH:mm")}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" asChild>
              <Link href="/ventas">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Link>
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Imprimir comprobante
            </Button>
            {canCancel ? (
              <Button variant="destructive" onClick={() => setOpen(true)}>
                Cancelar venta
              </Button>
            ) : null}
          </div>
        }
      />

      {/* Encabezado solo para la impresión del comprobante */}
      <div className="mb-4 hidden print:block">
        <p className="text-lg font-semibold">{settings?.name ?? "Gestor de ventas"}</p>
        <p className="text-sm">Comprobante interno {data.code}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant={data.status === "completed" ? "success" : "secondary"}>{SALE_STATUS_LABELS[data.status]}</Badge>
        <Badge variant="outline">{PAYMENT_LABELS[data.paymentMethod]}</Badge>
        {data.sellerName ? <Badge variant="outline">Vendedor: {data.sellerName}</Badge> : null}
      </div>

      {data.status === "cancelled" ? (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">Venta cancelada</p>
          <p className="text-muted-foreground">
            {data.cancelledAt ? format(new Date(data.cancelledAt), "dd/MM/yyyy HH:mm") : "Fecha desconocida"}
            {data.cancelReason ? ` · ${data.cancelReason}` : ""}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ítems</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cant.</TableHead>
                  <TableHead>P. unit.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{formatMoney(item.unitPrice)}</TableCell>
                    <TableCell className="text-right">{formatMoney(item.subtotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Cliente: </span>
              {data.customerName || "Mostrador"}
            </p>
            <p>
              <span className="text-muted-foreground">Documento: </span>
              {data.customerDocument || "—"}
            </p>
            <div className="mt-2 space-y-1 border-t pt-3">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatMoney(data.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Descuento</span>
                <span>{formatMoney(data.discount)}</span>
              </div>
              <div className="flex justify-between">
                <span>{settings?.taxName ?? "Impuesto"}</span>
                <span>{formatMoney(data.tax)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatMoney(data.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar {data.code}</DialogTitle>
            <DialogDescription>
              Se repone el stock de los productos y la venta queda anulada. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              maxLength={500}
              placeholder="Ej.: el cliente desistió, error al cobrar…"
              onChange={(e) => setReason(e.target.value)}
            />
            {reason.trim().length > 0 && reason.trim().length < 3 ? (
              <p className="text-xs text-destructive">Escribe al menos 3 caracteres o déjalo vacío.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={cancel.isPending}>
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmCancel()}
              disabled={cancel.isPending || (reason.trim().length > 0 && reason.trim().length < 3)}
            >
              {cancel.isPending ? "Cancelando…" : "Cancelar venta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
