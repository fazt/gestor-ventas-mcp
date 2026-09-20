"use client";

import * as React from "react";
import { adjustStockSchema, type Product, type StockMovement } from "@gestor/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAdjustStock, useLowStock, useStockMovements } from "@/hooks/use-inventory";
import { useProducts } from "@/hooks/use-products";
import { ApiError } from "@/lib/api";
import { MOVEMENT_LABELS } from "@/lib/types";

type AdjustForm = {
  productId: number;
  type: "in" | "adjustment";
  quantity: number;
  reason: string;
};

export default function InventoryPage() {
  const [page, setPage] = React.useState(1);
  const [type, setType] = React.useState("all");
  const { data: productsPage } = useProducts({ page: 1, pageSize: 100, isActive: true });
  const products = productsPage?.data ?? [];
  const { data: lowStock = [] } = useLowStock();
  const { data: movements, isLoading } = useStockMovements({
    page,
    pageSize: 20,
    type: type === "all" ? undefined : (type as "in" | "out" | "adjustment"),
  });
  const adjust = useAdjustStock();

  const form = useForm<AdjustForm>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: { productId: 0, type: "in", quantity: 1, reason: "" },
  });

  const movementType = form.watch("type");

  const productName = React.useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p.name]));
    lowStock.forEach((p) => map.set(p.id, p.name));
    return (id: number) => map.get(id) ?? `#${id}`;
  }, [products, lowStock]);

  async function onAdjust(values: AdjustForm) {
    try {
      await adjust.mutateAsync({
        ...values,
        productId: Number(values.productId),
        quantity: Number(values.quantity),
      });
      toast.success("Movimiento registrado");
      form.reset({ productId: values.productId, type: "in", quantity: 1, reason: "" });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo ajustar el stock");
    }
  }

  const stockColumns: Column<Product>[] = [
    { id: "name", header: "Producto", cell: (row) => <span className="font-medium">{row.name}</span> },
    { id: "sku", header: "SKU", cell: (row) => row.sku },
    { id: "stock", header: "Stock", cell: (row) => row.stock },
    { id: "min", header: "Mínimo", cell: (row) => row.minStock },
    {
      id: "alert",
      header: "",
      cell: (row) =>
        row.stock <= row.minStock ? <Badge variant="warning">Bajo</Badge> : <Badge variant="success">OK</Badge>,
    },
  ];

  const movementColumns: Column<StockMovement>[] = [
    {
      id: "date",
      header: "Fecha",
      cell: (row) => format(new Date(row.createdAt), "dd/MM/yyyy HH:mm"),
    },
    { id: "product", header: "Producto", cell: (row) => productName(row.productId) },
    {
      id: "type",
      header: "Tipo",
      cell: (row) => <Badge variant="outline">{MOVEMENT_LABELS[row.type]}</Badge>,
    },
    { id: "qty", header: "Cant.", cell: (row) => row.quantity },
    {
      id: "stock",
      header: "Stock",
      cell: (row) => `${row.previousStock} → ${row.newStock}`,
    },
    { id: "reason", header: "Motivo", cell: (row) => row.reason || "—" },
  ];

  return (
    <div>
      <PageHeader
        title="Inventario"
        description="Stock actual, historial de movimientos y ajustes auditados."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Stock actual</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={stockColumns} data={products} rowKey={(r) => r.id} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ajuste / entrada</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={form.handleSubmit(onAdjust)}>
              <div className="grid gap-2">
                <Label>Producto</Label>
                <Select
                  value={String(form.watch("productId") || "")}
                  onValueChange={(v) => form.setValue("productId", Number(v), { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select
                  value={movementType}
                  onValueChange={(v) =>
                    form.setValue("type", (v ?? "in") as "in" | "adjustment", { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Entrada</SelectItem>
                    <SelectItem value="adjustment">Ajuste</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="quantity">
                  {movementType === "in" ? "Cantidad a ingresar" : "Nuevo stock"}
                </Label>
                <Input id="quantity" type="number" {...form.register("quantity", { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground">
                  {movementType === "in"
                    ? "Se suma al stock actual del producto."
                    : "Reemplaza el stock actual por este valor absoluto."}
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reason">Motivo</Label>
                <Textarea id="reason" {...form.register("reason")} />
              </div>
              <Button type="submit" disabled={adjust.isPending}>
                Registrar movimiento
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Movimientos</h2>
          <Select value={type} onValueChange={(v) => { setType(v ?? "all"); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="in">Entradas</SelectItem>
              <SelectItem value="out">Salidas</SelectItem>
              <SelectItem value="adjustment">Ajustes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DataTable
          columns={movementColumns}
          data={movements?.data ?? []}
          loading={isLoading}
          rowKey={(r) => r.id}
          page={movements?.page ?? page}
          pageSize={movements?.pageSize ?? 20}
          total={movements?.total}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
