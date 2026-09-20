import {
  createProductSchema,
  productListQuerySchema,
  updateProductSchema,
} from "@gestor/shared";
import { Router } from "express";
import { idParamSchema } from "../../lib/params.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { validate } from "../../middlewares/validate.js";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "./products.service.js";

export const productsRouter = Router();

productsRouter.get("/", validate({ query: productListQuerySchema }), async (req, res) => {
  const query = productListQuerySchema.parse(req.query);
  res.json(await listProducts(query));
});

productsRouter.get("/:id", validate({ params: idParamSchema }), async (req, res) => {
  const id = Number(req.params.id);
  res.json(await getProduct(id));
});

productsRouter.post("/", validate({ body: createProductSchema }), async (req, res) => {
  const product = await createProduct(req.body);
  res.status(201).json(product);
});

productsRouter.put(
  "/:id",
  requireRole("admin"),
  validate({ params: idParamSchema, body: updateProductSchema }),
  async (req, res) => {
    const id = Number(req.params.id);
    res.json(await updateProduct(id, req.body));
  },
);

productsRouter.delete(
  "/:id",
  requireRole("admin"),
  validate({ params: idParamSchema }),
  async (req, res) => {
    const id = Number(req.params.id);
    res.json(await deleteProduct(id));
  },
);
