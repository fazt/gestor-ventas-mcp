"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@gestor/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/use-auth";
import { ApiError } from "@/lib/api";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Solo rutas internas: evita usar `?from=//otro-sitio.com` como redirección abierta. */
function safeFrom(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/dashboard";
  return value;
}

type LoginForm = {
  email: string;
  password: string;
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: DEMO_MODE ? { email: "admin@ventas.com", password: "admin123" } : { email: "", password: "" },
  });

  async function onSubmit(values: LoginForm) {
    try {
      await login.mutateAsync(values);
      toast.success("Bienvenido");
      router.replace(safeFrom(searchParams.get("from")));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo iniciar sesión");
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>Panel de gestión de ventas. Acceso restringido al equipo.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...form.register("password")}
            />
            {form.formState.errors.password ? (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            ) : null}
          </div>
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? "Ingresando…" : "Entrar"}
          </Button>
        </form>
        {DEMO_MODE ? (
          <p className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Demo: <strong>admin@ventas.com</strong> o <strong>vendedor@ventas.com</strong>, contraseña{" "}
            <strong>admin123</strong>.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_oklch(0.92_0.04_168),_transparent_55%),linear-gradient(180deg,oklch(0.97_0.01_80),oklch(0.94_0.02_250))] p-4 pt-20 dark:bg-[radial-gradient(ellipse_at_top,_oklch(0.3_0.05_168),_transparent_55%),linear-gradient(180deg,oklch(0.18_0.01_250),oklch(0.14_0.02_250))]">
      <div className="absolute left-6 top-6 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          GV
        </div>
        <span className="font-semibold">Gestor de ventas</span>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
