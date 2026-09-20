"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { createProductSchema, type Product } from "@gestor/shared";
import { z } from "zod";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useMe } from "@/hooks/use-auth";
import { useCategories } from "@/hooks/use-categories";
import {
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useUpdateProduct,
} from "@/hooks/use-products";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/money";

const productFormSchema = createProductSchema.extend({
  stock: z.number().int().min(0),
  minStock: z.number().int().min(0),
});

type ProductForm = z.infer<typeof productFormSchema>;

export default function ProductsPage() {
  const { data: me } = useMe();
  const isAdmin = me?.user.role === "admin";
  const { data: categories = [] } = useCategories();

  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string>("all");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = {
    page,
    pageSize: 20,
    search: debounced || undefined,
    categoryId: categoryId === "all" ? undefined : Number(categoryId),
  };
  const { data, isLoading } = useProducts(query);
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const remove = useDeleteProduct();

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Product | null>(null);
  const [toDelete, setToDelete] = React.useState<Product | null>(null);

  const form = useForm<ProductForm>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      sku: "",
      name: "",
      description: "",
      categoryId: 0,
      price: "0.00",
      cost: "0.00",
      stock: 0,
      minStock: 0,
    },
  });

  function openCreate() {
    setEditing(null);
    form.reset({
      sku: "",
      name: "",
      description: "",
      categoryId: categories[0]?.id ?? 0,
      price: "0.00",
      cost: "0.00",
      stock: 0,
      minStock: 0,
    });
    setOpen(true);
  }

  function openEdit(row: Product) {
    setEditing(row);
    form.reset({
      sku: row.sku,
      name: row.name,
      description: row.description ?? "",
      categoryId: row.categoryId,
      price: row.price,
      cost: row.cost,
      stock: row.stock,
      minStock: row.minStock,
    });
    setOpen(true);
  }

  async function onSubmit(values: ProductForm) {
    try {
      const payload = {
        ...values,
        stock: Number(values.stock),
        minStock: Number(values.minStock),
        categoryId: Number(values.categoryId),
      };
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast.success("Producto actualizado");
      } else {
        await create.mutateAsync(payload);
        toast.success("Producto creado");
      }
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo guardar");
    }
  }

  const categoryName = React.useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id: number) => map.get(id) ?? `#${id}`;
  }, [categories]);

  const columns: Column<Product>[] = [
    { id: "sku", header: "SKU", cell: (row) => <span className="font-mono text-xs">{row.sku}</span> },
    { id: "name", header: "Producto", cell: (row) => <span className="font-medium">{row.name}</span> },
    { id: "category", header: "Categoría", cell: (row) => categoryName(row.categoryId) },
    { id: "price", header: "Precio", cell: (row) => formatMoney(row.price) },
    {
      id: "stock",
      header: "Stock",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span>{row.stock}</span>
          {row.stock <= row.minStock ? <Badge variant="warning">Bajo</Badge> : null}
        </div>
      ),
    },
    {
      id: "status",
      header: "Estado",
      cell: (row) => (
        <Badge variant={row.isActive ? "success" : "secondary"}>
          {row.isActive ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      className: "w-28 text-right",
      cell: (row) =>
        isAdmin ? (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setToDelete(row)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
            Ver
          </Button>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Productos"
        description="Catálogo con búsqueda por nombre o SKU y alerta de stock bajo."
        actions={
          isAdmin ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nuevo producto
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={categoryId}
          onValueChange={(v) => {
            setCategoryId(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" {...form.register("sku")} disabled={!isAdmin} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" {...form.register("name")} disabled={!isAdmin} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Categoría</Label>
              <Select
                value={String(form.watch("categoryId") || "")}
                onValueChange={(v) => form.setValue("categoryId", Number(v), { shouldValidate: true })}
                disabled={!isAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" {...form.register("description")} disabled={!isAdmin} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="price">Precio</Label>
                <Input id="price" {...form.register("price")} disabled={!isAdmin} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cost">Costo</Label>
                <Input id="cost" {...form.register("cost")} disabled={!isAdmin} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="stock">Stock</Label>
                <Input id="stock" type="number" {...form.register("stock", { valueAsNumber: true })} disabled={!isAdmin} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="minStock">Stock mínimo</Label>
                <Input
                  id="minStock"
                  type="number"
                  {...form.register("minStock", { valueAsNumber: true })}
                  disabled={!isAdmin}
                />
              </div>
            </div>
            {isAdmin ? (
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={create.isPending || update.isPending}>
                  Guardar
                </Button>
              </DialogFooter>
            ) : null}
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Eliminar producto"
        description={`¿Desactivar o eliminar “${toDelete?.name}”?`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await remove.mutateAsync(toDelete.id);
            toast.success("Producto eliminado");
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo eliminar");
            throw error;
          }
        }}
      />
    </div>
  );
}
