import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type Schemas = {
  body?: ZodType;
  params?: ZodType;
};

/**
 * Valida y normaliza `body` y `params`.
 *
 * La query string NO se valida aquí: en Express 5 `req.query` es un getter que se
 * recalcula en cada acceso, así que asignarle valores no tiene efecto. Cada ruta
 * hace `schema.parse(req.query)` y usa el resultado.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        // Express 5 deja `req.body` en undefined si la petición no trae cuerpo.
        req.body = schemas.body.parse(req.body ?? {});
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params) as Record<string, string>;
        Object.assign(req.params, parsed);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
