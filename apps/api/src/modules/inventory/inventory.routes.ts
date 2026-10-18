import { adjustStockSchema, stockMovementListQuerySchema } from "@gestor/shared";
import { Router } from "express";
import { AppError } from "../../lib/errors.js";
import { validate } from "../../middlewares/validate.js";
import { adjustStock, listLowStock, listMovements } from "./inventory.service.js";

export const inventoryRouter = Router();

inventoryRouter.get("/movements", async (req, res) => {
  const query = stockMovementListQuerySchema.parse(req.query);
  res.json(await listMovements(query));
});

inventoryRouter.get("/low-stock", async (_req, res) => {
  res.json(await listLowStock());
});

inventoryRouter.post("/adjust", validate({ body: adjustStockSchema }), async (req, res) => {
  if (!req.user) {
    throw new AppError(401, "No autenticado");
  }
  const result = await adjustStock(req.user.id, req.body);
  res.status(201).json(result);
});
