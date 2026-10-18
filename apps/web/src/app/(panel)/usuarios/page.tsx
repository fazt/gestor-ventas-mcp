"use client";

import * as React from "react";
import type { User, UserRole } from "@gestor/shared";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/hooks/use-auth";
import { useCreateUser, useUpdateUser, useUsers } from "@/hooks/use-team";
import { ApiError } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/types";

type FormState = { name: string; email: string; password: string; role: UserRole };
const EMPTY: FormState = { name: "", email: "", password: "", role: "seller" };

export default function UsersPage() {
  const { data: me } = useMe();
  const users = useUsers();
  const create = useCreateUser();
  const update = useUpdateUser();

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<User | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY);

  if (me && me.user.role !== "admin") {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Solo un administrador puede gestionar el equipo.
      </div>
    );
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({ name: user.name, email: user.email, password: "", role: user.role });
    setOpen(true);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          name: form.name.trim(),
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success("Usuario actualizado");
      } else {
        await create.mutateAsync({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        });
        toast.success("Usuario creado");
      }
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo guardar");
    }
  }

  async function toggleActive(user: User) {
    try {
      await update.mutateAsync({ id: user.id, isActive: !user.isActive });
      toast.success(user.isActive ? "Usuario desactivado: se cerraron sus sesiones y tokens" : "Usuario reactivado");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo actualizar");
    }
  }

  const columns: Column<User>[] = [
    {
      id: "name",
      header: "Nombre",
      cell: (row) => (
        <div>
          <p className="font-medium">
            {row.name}
            {row.id === me?.user.id ? <span className="ml-2 text-xs text-muted-foreground">(tú)</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    { id: "role", header: "Rol", cell: (row) => <Badge variant="outline">{ROLE_LABELS[row.role]}</Badge> },
    {
      id: "status",
      header: "Estado",
      cell: (row) => (
        <Badge variant={row.isActive ? "success" : "secondary"}>{row.isActive ? "Activo" : "Inactivo"}</Badge>
      ),
    },
    { id: "created", header: "Alta", cell: (row) => format(new Date(row.createdAt), "dd/MM/yyyy") },
    {
      id: "actions",
      header: "",
      className: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
            Editar
          </Button>
          {row.id !== me?.user.id ? (
            <Button variant="outline" size="sm" onClick={() => void toggleActive(row)} disabled={update.isPending}>
              {row.isActive ? "Desactivar" : "Reactivar"}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const passwordRequired = !editing;
  const passwordInvalid = form.password.length > 0 && form.password.length < 8;

  return (
    <div>
      <PageHeader
        title="Equipo"
        description="Administradores y vendedores. Desactivar a alguien corta su sesión y revoca sus tokens."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo usuario
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={users.data ?? []}
        loading={users.isLoading}
        empty="Sin usuarios"
        rowKey={(row) => row.id}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{editing ? `Editar ${editing.name}` : "Nuevo usuario"}</DialogTitle>
              <DialogDescription>
                {editing ? "Deja la contraseña vacía para no cambiarla." : "Comparte la contraseña inicial por un canal seguro."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="user-name">Nombre</Label>
              <Input
                id="user-name"
                required
                minLength={2}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-email">Correo</Label>
              <Input
                id="user-email"
                type="email"
                required
                disabled={Boolean(editing)}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-password">{editing ? "Nueva contraseña" : "Contraseña inicial"}</Label>
              <Input
                id="user-password"
                type="password"
                autoComplete="new-password"
                required={passwordRequired}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
              {passwordInvalid ? <p className="text-xs text-destructive">Mínimo 8 caracteres.</p> : null}
            </div>
            <div className="grid gap-2">
              <Label>Rol</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v === "admin" ? "admin" : "seller" }))}
                disabled={editing?.id === me?.user.id}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">Vendedor: vende, consulta y mueve inventario</SelectItem>
                  <SelectItem value="admin">Administrador: además gestiona catálogo y equipo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending || passwordInvalid}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
