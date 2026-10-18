import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { env } from "./env.js";

/**
 * Fechas de negocio en la zona horaria de la tienda (STORE_TIMEZONE), calculadas en
 * Postgres. Así "hoy", "este mes" y los filtros por fecha no dependen de la zona del
 * servidor (un contenedor en UTC contaba como "mañana" las ventas de la noche en Lima).
 *
 * `timestamp AT TIME ZONE tz` interpreta la hora como local de `tz` y devuelve el
 * instante absoluto (timestamptz): 2026-01-31 00:00 en America/Lima = 05:00 UTC.
 */
const TZ_PATTERN = /^[A-Za-z0-9_+\-/]+$/;

/**
 * La zona va como literal SQL y no como parámetro: con parámetros, Postgres trata
 * `GROUP BY (... AT TIME ZONE $1)` y `SELECT (... AT TIME ZONE $2)` como expresiones
 * distintas y falla. Es seguro porque STORE_TIMEZONE se valida (IANA + patrón).
 */
export function tzLiteral(): SQL {
  const zone = env.STORE_TIMEZONE;
  if (!TZ_PATTERN.test(zone)) {
    throw new Error(`STORE_TIMEZONE inválida: ${zone}`);
  }
  return sql.raw(`'${zone}'`);
}

/** Inicio (inclusive) del día local `YYYY-MM-DD`. */
export function localDayStart(date: string): SQL {
  return sql`((${date})::date)::timestamp AT TIME ZONE ${tzLiteral()}`;
}

/** Fin (exclusivo) del día local `YYYY-MM-DD`: inicio del día siguiente. */
export function localDayEnd(date: string): SQL {
  return sql`(((${date})::date + 1))::timestamp AT TIME ZONE ${tzLiteral()}`;
}

export function startOfToday(): SQL {
  return sql`(date_trunc('day', now() AT TIME ZONE ${tzLiteral()}) AT TIME ZONE ${tzLiteral()})`;
}

export function startOfMonth(): SQL {
  return sql`(date_trunc('month', now() AT TIME ZONE ${tzLiteral()}) AT TIME ZONE ${tzLiteral()})`;
}

/** Fecha local (date) de una columna timestamptz. */
export function localDateOf(column: AnyColumn | SQL): SQL {
  return sql`((${column}) AT TIME ZONE ${tzLiteral()})::date`;
}

/** Hoy en la zona de la tienda, como `date`. */
export function localToday(): SQL {
  return sql`((now() AT TIME ZONE ${tzLiteral()})::date)`;
}
