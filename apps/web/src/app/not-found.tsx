import Link from "next/link";

export const metadata = { title: "Página no encontrada" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-6xl font-bold text-muted-foreground/40">404</p>
      <h1 className="text-xl font-semibold">No encontramos esta página</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Puede que el enlace esté mal escrito o que el registro ya no exista.
      </p>
      <Link
        href="/dashboard"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Volver al panel
      </Link>
    </main>
  );
}
