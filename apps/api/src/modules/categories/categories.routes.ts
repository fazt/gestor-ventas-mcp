import { createCategorySchema, updateCategorySchema } from "@gestor/shared";
import { Router } from "express";
import { idParamSchema } from "../../lib/params.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { validate } from "../../middlewares/validate.js";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "./categories.service.js";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (_req, res) => {
  res.json(await listCategories());
});

categoriesRouter.get("/:id", validate({ params: idParamSchema }), async (req, res) => {
  const id = Number(req.params.id);
  res.json(await getCategory(id));
});

categoriesRouter.post("/", validate({ body: createCategorySchema }), async (req, res) => {
  const category = await createCategory(req.body);
  res.status(201).json(category);
});

categoriesRouter.put(
  "/:id",
  requireRole("admin"),
  validate({ params: idParamSchema, body: updateCategorySchema }),
  async (req, res) => {
    const id = Number(req.params.id);
    res.json(await updateCategory(id, req.body));
  },
);

categoriesRouter.delete(
  "/:id",
  requireRole("admin"),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const id = Number(req.params.id);
    await deleteCategory(id);
    res.status(204).send();
  },
);
