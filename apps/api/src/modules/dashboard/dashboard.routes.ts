import { Router } from "express";
import { reportQuerySchema, salesChartQuerySchema, topProductsRangeQuerySchema } from "./dashboard.schema.js";
import { getReport, getSalesChart, getStoreSettings, getSummary, getTopProducts } from "./dashboard.service.js";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", async (_req, res) => {
  res.json(await getSummary());
});

dashboardRouter.get("/sales-chart", async (req, res) => {
  const query = salesChartQuerySchema.parse(req.query);
  res.json(await getSalesChart(query.days));
});

dashboardRouter.get("/top-products", async (req, res) => {
  const query = topProductsRangeQuerySchema.parse(req.query);
  res.json(await getTopProducts(query.limit, query.days));
});

dashboardRouter.get("/report", async (req, res) => {
  const query = reportQuerySchema.parse(req.query);
  res.json(await getReport(query.from, query.to));
});

dashboardRouter.get("/settings", (_req, res) => {
  res.json(getStoreSettings());
});
