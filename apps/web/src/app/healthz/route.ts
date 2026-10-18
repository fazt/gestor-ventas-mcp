export const dynamic = "force-dynamic";

/** Healthcheck del contenedor web (no depende de la API). */
export function GET() {
  return Response.json({ status: "ok" });
}
