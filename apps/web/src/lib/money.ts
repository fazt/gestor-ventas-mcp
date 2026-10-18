const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY?.trim() || "PEN";
const LOCALE = process.env.NEXT_PUBLIC_LOCALE?.trim() || "es-PE";

const formatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
});

export function parseMoney(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Centavos enteros: evita que 0.1 + 0.2 muestre 0.30000000000000004. */
export function toCents(value: string | number | null | undefined): number {
  return Math.round(parseMoney(value) * 100);
}

export function formatMoney(value: string | number | null | undefined): string {
  return formatter.format(parseMoney(value));
}

export function toMoneyString(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}
