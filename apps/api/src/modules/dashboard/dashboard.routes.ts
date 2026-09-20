import { Router } from "express";
import { validate } from "../../middlewares/validate.js";
import { salesChartQuerySchema, topProductsQuerySchema } from "./dashboard.schema.js";
import {
  getSalesChart,
  getSummary,
  getTopProducts,
} from "./dashboard.service.js";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", async (_req, res) => {
  res.json(await getSummary());
});

dashboardRouter.get("/sales-chart", validate({ query: salesChartQuerySchema }), async (req, res) => {
  const query = salesChartQuerySchema.parse(req.query);
  res.json(await getSalesChart(query.days));
});

dashboardRouter.get("/top-products", validate({ query: topProductsQuerySchema }), async (req, res) => {
  const query = topProductsQuerySchema.parse(req.query);
  res.json(await getTopProducts(query.limit));
});
