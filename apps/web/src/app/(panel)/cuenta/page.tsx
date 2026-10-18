"use client";

import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-auth";
import { useChangePassword } from "@/hooks/use-team";
import { ApiError } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/types";

export default function AccountPage() {
  const { data } = useMe();
  const change = useChangePassword();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch || tooShort) return;
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      toast.success("Contraseña actualizada");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo cambiar la contraseña");
    }
  }

  const user = data?.user;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Mi cuenta" description="Tus datos y tu contraseña." />
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perfil</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <p>
              <span className="text-muted-foreground">Nombre: </span>
              {user?.name ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Correo: </span>
              {user?.email ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Rol: </span>
              {user ? ROLE_LABELS[user.role] : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cambiar contraseña</CardTitle>
            <CardDescription>
              Si olvidaste tu contraseña, pide a un administrador que te asigne una nueva desde Equipo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={(e) => void onSubmit(e)}>
              <div className="grid gap-2">
                <Label htmlFor="current">Contraseña actual</Label>
                <Input
                  id="current"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="next">Nueva contraseña</Label>
                <Input
                  id="next"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
                {tooShort ? <p className="text-xs text-destructive">Mínimo 8 caracteres.</p> : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm">Repite la nueva contraseña</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {mismatch ? <p className="text-xs text-destructive">Las contraseñas no coinciden.</p> : null}
              </div>
              <div>
                <Button type="submit" disabled={change.isPending || mismatch || tooShort}>
                  {change.isPending ? "Guardando…" : "Actualizar contraseña"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
