import { cancelSaleSchema, createSaleSchema, saleExportQuerySchema, saleListQuerySchema } from "@gestor/shared";
import { Router } from "express";
import { AppError } from "../../lib/errors.js";
import { idParamSchema } from "../../lib/params.js";
import { validate } from "../../middlewares/validate.js";
import { cancelSale, createSale, exportSalesCsv, getSale, listSales } from "./sales.service.js";

export const salesRouter = Router();

salesRouter.get("/", async (req, res) => {
  const query = saleListQuerySchema.parse(req.query);
  res.json(await listSales(query));
});

// Antes de `/:id` para que "export.csv" no se interprete como id.
salesRouter.get("/export.csv", async (req, res) => {
  const query = saleExportQuerySchema.parse(req.query);
  const csv = await exportSalesCsv(query);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ventas-${stamp}.csv"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(csv);
});

salesRouter.get("/:id", validate({ params: idParamSchema }), async (req, res) => {
  res.json(await getSale(Number(req.params.id)));
});

salesRouter.post("/", validate({ body: createSaleSchema }), async (req, res) => {
  if (!req.user) {
    throw new AppError(401, "No autenticado");
  }
  const sale = await createSale(req.user.id, req.body);
  res.status(201).json(sale);
});

salesRouter.post(
  "/:id/cancel",
  validate({ params: idParamSchema, body: cancelSaleSchema }),
  async (req, res) => {
    if (!req.user) {
      throw new AppError(401, "No autenticado");
    }
    const body = req.body as { reason?: string };
    res.json(await cancelSale(Number(req.params.id), req.user, body.reason));
  },
);
