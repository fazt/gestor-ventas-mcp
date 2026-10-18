"use client";

import * as React from "react";
import {
  Bot,
  ChartColumn,
  FolderTree,
  KeyRound,
  LayoutDashboard,
  Package,
  PanelLeft,
  PlusCircle,
  ShoppingCart,
  Users,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ventas/nueva", label: "Nueva venta", icon: PlusCircle },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart },
  { href: "/productos", label: "Productos", icon: Package },
  { href: "/categorias", label: "Categorías", icon: FolderTree },
  { href: "/inventario", label: "Inventario", icon: Warehouse },
  { href: "/reportes", label: "Reportes", icon: ChartColumn },
  { href: "/integraciones", label: "Integraciones IA", icon: KeyRound },
  { href: "/actividad", label: "Actividad IA", icon: Bot },
  { href: "/usuarios", label: "Equipo", icon: Users, adminOnly: true },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/ventas") {
    return pathname === "/ventas" || (pathname.startsWith("/ventas/") && !pathname.startsWith("/ventas/nueva"));
  }
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function useNavItems(): NavItem[] {
  const { data } = useMe();
  const isAdmin = data?.user.role === "admin";
  return NAV.filter((item) => !item.adminOnly || isAdmin);
}

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const items = useNavItems();

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex print:hidden",
        collapsed ? "w-[72px]" : "w-60",
      )}
    >
      <div className="flex h-14 items-center gap-2 px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
          GV
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Gestor de ventas</p>
            <p className="truncate text-xs text-sidebar-foreground/60">Panel + MCP</p>
          </div>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Navegación principal">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/** Navegación móvil: tira horizontal desplazable bajo la barra superior. */
export function MobileNav() {
  const pathname = usePathname();
  const items = useNavItems();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b bg-card p-2 md:hidden print:hidden" aria-label="Navegación principal">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs",
              active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
