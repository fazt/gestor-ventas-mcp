"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout, useMe } from "@/hooks/use-auth";

export function AppTopbar() {
  const router = useRouter();
  const { data } = useMe();
  const logout = useLogout();
  const user = data?.user;

  async function onLogout() {
    try {
      await logout.mutateAsync();
    } catch {
      // cookie may already be gone
    }
    toast.success("Sesión cerrada");
    router.replace("/login");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">Panel de gestión</p>
        <p className="truncate text-xs text-muted-foreground">
          Inventario, catálogo y punto de venta
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {(user?.name ?? "U").slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden sm:inline">{user?.name ?? "Usuario"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span>{user?.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
              <span className="mt-1 text-xs font-normal capitalize text-muted-foreground">
                {user?.role === "admin" ? "Administrador" : "Vendedor"}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void onLogout()}>
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
