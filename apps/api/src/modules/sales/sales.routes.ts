import { createSaleSchema, saleListQuerySchema } from "@gestor/shared";
import { Router } from "express";
import { AppError } from "../../lib/errors.js";
import { idParamSchema } from "../../lib/params.js";
import { validate } from "../../middlewares/validate.js";
import { cancelSale, createSale, getSale, listSales } from "./sales.service.js";

export const salesRouter = Router();

salesRouter.get("/", validate({ query: saleListQuerySchema }), async (req, res) => {
  const query = saleListQuerySchema.parse(req.query);
  res.json(await listSales(query));
});

salesRouter.get("/:id", validate({ params: idParamSchema }), async (req, res) => {
  const id = Number(req.params.id);
  res.json(await getSale(id));
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
  validate({ params: idParamSchema }),
  async (req, res) => {
    if (!req.user) {
      throw new AppError(401, "No autenticado");
    }
    const id = Number(req.params.id);
    res.json(await cancelSale(id, req.user.id));
  },
);
