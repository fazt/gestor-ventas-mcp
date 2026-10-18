"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Algo salió mal</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ocurrió un error inesperado al mostrar esta pantalla. Puedes reintentar; si persiste, avisa al administrador
        {error.digest ? ` (código ${error.digest})` : ""}.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Reintentar
      </button>
    </main>
  );
}
