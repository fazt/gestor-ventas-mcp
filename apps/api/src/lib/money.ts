/**
 * Dinero: en la base se guarda como `numeric(12,2)` y en la API viaja como texto ("129.90").
 * Los cálculos se hacen en centavos enteros para evitar errores de coma flotante
 * (0.1 + 0.2 !== 0.3).
 */

export function toCents(value: string | number): number {
  if (typeof value === "number") {
    return Math.round(value * 100);
  }
  const trimmed = value.trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    // Valores que vienen de Postgres con más decimales (p. ej. sumas): se redondea.
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Monto inválido: ${value}`);
    }
    return Math.round(parsed * 100);
  }
  const sign = match[1] ? -1 : 1;
  const units = Number(match[2]);
  const decimals = Number((match[3] ?? "").padEnd(2, "0"));
  return sign * (units * 100 + decimals);
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Normaliza cualquier monto a texto con 2 decimales. */
export function asMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "0.00";
  }
  return fromCents(toCents(value));
}
