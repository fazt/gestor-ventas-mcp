"use client";

import * as React from "react";
import { AppSidebar, MobileNav } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";

export function PanelShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <MobileNav />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
