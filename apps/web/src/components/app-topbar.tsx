"use client";

import { KeyRound, LogOut, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { ROLE_LABELS } from "@/lib/types";

export function AppTopbar() {
  const router = useRouter();
  const { data } = useMe();
  const logout = useLogout();
  const user = data?.user;

  async function onLogout() {
    try {
      await logout.mutateAsync();
    } catch {
      // la cookie puede no existir ya
    }
    toast.success("Sesión cerrada");
    router.replace("/login");
  }

  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b bg-card px-4 print:hidden">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">Panel de gestión</p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          Punto de venta, inventario y conexión con asistentes de IA
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="max-w-[12rem] gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {(user?.name ?? "U").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden truncate sm:inline">{user?.name ?? "Usuario"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user?.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
                <span className="mt-1 text-xs font-normal text-muted-foreground">
                  {user ? ROLE_LABELS[user.role] : ""}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/cuenta")}>
              <UserCog className="h-4 w-4" />
              Mi cuenta
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/integraciones")}>
              <KeyRound className="h-4 w-4" />
              Tokens e integraciones
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void onLogout()}>
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
