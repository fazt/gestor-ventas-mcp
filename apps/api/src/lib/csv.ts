/**
 * CSV seguro para Excel / Google Sheets: escapa comillas y neutraliza celdas que empiezan
 * por `= + - @` (o tab/CR), que la hoja de cálculo ejecutaría como fórmula (CSV injection).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r;]/.test(text)) {
    text = `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/** BOM para que Excel detecte UTF-8 (tildes y ñ). */
export const CSV_BOM = "﻿";
