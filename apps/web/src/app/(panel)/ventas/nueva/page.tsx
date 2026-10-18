"use client";

import * as React from "react";
import type { PaymentMethod, Product } from "@gestor/shared";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
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
import { useProducts } from "@/hooks/use-products";
import { useCreateSale } from "@/hooks/use-sales";
import { ApiError } from "@/lib/api";
import { useStoreSettings } from "@/hooks/use-dashboard";
import { formatMoney, toCents, toMoneyString } from "@/lib/money";
import { PAYMENT_LABELS } from "@/lib/types";

type CartLine = {
  product: Product;
  quantity: number;
};

export default function NewSalePage() {
  const router = useRouter();
  const create = useCreateSale();
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [discount, setDiscount] = React.useState("0.00");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("cash");
  const [customerName, setCustomerName] = React.useState("");
  const [customerDocument, setCustomerDocument] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useProducts({
    page: 1,
    pageSize: 20,
    search: debounced || undefined,
    isActive: "true",
  });
  const { data: settings } = useStoreSettings();

  const products = data?.data ?? [];

  function addProduct(product: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      const nextQty = (existing?.quantity ?? 0) + 1;
      if (nextQty > product.stock) {
        toast.error(`Stock insuficiente para ${product.name}`);
        return prev;
      }
      if (existing) {
        return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: nextQty } : l));
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function setQty(productId: number, quantity: number) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.product.id !== productId) return l;
          if (quantity > l.product.stock) {
            toast.error("No hay stock suficiente");
            return l;
          }
          return { ...l, quantity };
        })
        .filter((l) => l.quantity > 0),
    );
  }

  // Cálculo en centavos (igual que la API) para que el total mostrado coincida con el cobrado.
  const subtotalCents = cart.reduce((sum, line) => sum + toCents(line.product.price) * line.quantity, 0);
  // Mismo formato que `moneySchema` en @gestor/shared: la API rechaza cualquier otra cosa.
  const discountValid = /^\d+(\.\d{1,2})?$/.test(discount.trim());
  const discountCents = discountValid ? Math.min(toCents(discount), subtotalCents) : 0;
  const taxRate = settings?.taxRate ?? 0;
  const taxCents = taxRate > 0 ? Math.round(((subtotalCents - discountCents) * taxRate) / 100) : 0;
  const subtotal = subtotalCents / 100;
  const discountNum = discountCents / 100;
  const tax = taxCents / 100;
  const total = Math.max(0, subtotalCents - discountCents + taxCents) / 100;

  async function checkout() {
    if (cart.length === 0) {
      toast.error("Agrega al menos un producto");
      return;
    }
    if (!discountValid) {
      toast.error("El descuento no es un monto válido");
      return;
    }
    try {
      const sale = await create.mutateAsync({
        customerName: customerName || undefined,
        customerDocument: customerDocument || undefined,
        discount: toMoneyString(discountNum),
        // Sin `tax`: la API aplica el impuesto configurado (STORE_TAX_RATE).
        paymentMethod,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      });
      toast.success(`Venta ${sale.code} registrada`);
      router.push(`/ventas/${sale.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo registrar la venta");
    }
  }

  return (
    <div>
      <PageHeader title="Nueva venta" description="Punto de venta: busca, arma el carrito y cobra." />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Productos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar producto por nombre o SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="grid max-h-[28rem] gap-2 overflow-auto">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : products.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin resultados</p>
              ) : (
                products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-accent"
                  >
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.sku} · Stock {product.stock}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">{formatMoney(product.price)}</span>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Carrito</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground">Vacío. Elige un producto a la izquierda.</p>
            ) : (
              <ul className="grid gap-3">
                {cart.map((line) => (
                  <li key={line.product.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{line.product.name}</p>
                        <p className="text-xs text-muted-foreground">{formatMoney(line.product.price)}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setQty(line.product.id, 0)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQty(line.product.id, line.quantity - 1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center text-sm">{line.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQty(line.product.id, line.quantity + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <span className="ml-auto text-sm font-medium">
                        {formatMoney((toCents(line.product.price) * line.quantity) / 100)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-2">
              <Label htmlFor="customerName">Cliente (opcional)</Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="customerDocument">Documento</Label>
              <Input
                id="customerDocument"
                value={customerDocument}
                onChange={(e) => setCustomerDocument(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Método de pago</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod((v ?? "cash") as PaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="discount">Descuento</Label>
              <Input
                id="discount"
                inputMode="decimal"
                aria-invalid={!discountValid}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
              {!discountValid ? (
                <p className="text-xs text-destructive">
                  Ingresa un monto válido con hasta dos decimales, por ejemplo 5.00
                </p>
              ) : null}
            </div>
            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Descuento</span>
                <span>{formatMoney(discountNum)}</span>
              </div>
              {taxRate > 0 ? (
                <div className="flex justify-between">
                  <span>
                    {settings?.taxName ?? "Impuesto"} ({taxRate}%)
                  </span>
                  <span>{formatMoney(tax)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatMoney(total)}</span>
              </div>
            </div>
            <Button
              size="lg"
              disabled={create.isPending || !discountValid}
              onClick={() => void checkout()}
            >
              {create.isPending ? "Registrando…" : `Cobrar ${formatMoney(total)}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
