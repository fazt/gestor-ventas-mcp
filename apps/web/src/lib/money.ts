const pen = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

export function parseMoney(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(value: string | number | null | undefined): string {
  return pen.format(parseMoney(value));
}

export function toMoneyString(value: number): string {
  return value.toFixed(2);
}
