export function asMoney(value: string | number): string {
  return Number(value).toFixed(2);
}

export function parseMoney(value: string | undefined, fallback = 0): number {
  if (value === undefined) {
    return fallback;
  }
  return Number(value);
}
