"use client";

import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
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
import { useCancelSale, useSale } from "@/hooks/use-sales";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { PAYMENT_LABELS, SALE_STATUS_LABELS } from "@/lib/types";

export default function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const saleId = Number(id);
  const { data, isLoading, isError } = useSale(saleId);
  const cancel = useCancelSale();
  const [confirm, setConfirm] = useState(false);

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (isError || !data) {
    return <p className="text-sm text-muted-foreground">No se encontró la venta.</p>;
  }

  return (
    <div>
      <PageHeader
        title={data.code}
        description={format(new Date(data.createdAt), "dd/MM/yyyy HH:mm")}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/ventas">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Link>
            </Button>
            {data.status === "completed" ? (
              <Button variant="destructive" onClick={() => setConfirm(true)}>
                Cancelar venta
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant={data.status === "completed" ? "success" : "secondary"}>
          {SALE_STATUS_LABELS[data.status]}
        </Badge>
        <Badge variant="outline">{PAYMENT_LABELS[data.paymentMethod]}</Badge>
      </div>

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
                <span>Impuesto</span>
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

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Cancelar venta"
        description="Se revertirá el stock de los productos y la venta quedará anulada."
        confirmLabel="Cancelar venta"
        destructive
        onConfirm={async () => {
          try {
            await cancel.mutateAsync(data.id);
            toast.success("Venta cancelada y stock repuesto");
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo cancelar");
            throw error;
          }
        }}
      />
    </div>
  );
}
