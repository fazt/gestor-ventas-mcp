"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { createCategorySchema, type Category } from "@gestor/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
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
import { Textarea } from "@/components/ui/textarea";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/hooks/use-categories";
import { useMe } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";

type CategoryForm = {
  name: string;
  description?: string;
};

export default function CategoriesPage() {
  const { data: me } = useMe();
  const isAdmin = me?.user.role === "admin";
  const { data = [], isLoading } = useCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [toDelete, setToDelete] = React.useState<Category | null>(null);

  const form = useForm<CategoryForm>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: { name: "", description: "" },
  });

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", description: "" });
    setOpen(true);
  }

  function openEdit(row: Category) {
    setEditing(row);
    form.reset({ name: row.name, description: row.description ?? "" });
    setOpen(true);
  }

  async function onSubmit(values: CategoryForm) {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...values });
        toast.success("Categoría actualizada");
      } else {
        await create.mutateAsync(values);
        toast.success("Categoría creada");
      }
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo guardar");
    }
  }

  const columns: Column<Category>[] = [
    { id: "name", header: "Nombre", cell: (row) => <span className="font-medium">{row.name}</span> },
    {
      id: "description",
      header: "Descripción",
      cell: (row) => row.description || "—",
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
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Categorías"
        description="Agrupa el catálogo para filtrar productos y reportes."
        actions={
          isAdmin ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nueva categoría
            </Button>
          ) : null
        }
      />
      <DataTable columns={columns} data={data} loading={isLoading} rowKey={(r) => r.id} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" {...form.register("name")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" {...form.register("description")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Eliminar categoría"
        description={`¿Eliminar “${toDelete?.name}”? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await remove.mutateAsync(toDelete.id);
            toast.success("Categoría eliminada");
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo eliminar");
            throw error;
          }
        }}
      />
    </div>
  );
}
