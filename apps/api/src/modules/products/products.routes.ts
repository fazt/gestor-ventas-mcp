import {
  createProductSchema,
  productListQuerySchema,
  updateProductSchema,
} from "@gestor/shared";
import { Router, type Request, type Response } from "express";
import { AppError } from "../../lib/errors.js";
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

productsRouter.get("/", async (req, res) => {
  const query = productListQuerySchema.parse(req.query);
  res.json(await listProducts(query));
});

productsRouter.get("/:id", validate({ params: idParamSchema }), async (req, res) => {
  res.json(await getProduct(Number(req.params.id)));
});

productsRouter.post("/", requireRole("admin"), validate({ body: createProductSchema }), async (req, res) => {
  if (!req.user) throw new AppError(401, "No autenticado");
  const product = await createProduct(req.body, req.user.id);
  res.status(201).json(product);
});

const updateHandlers = [
  requireRole("admin"),
  validate({ params: idParamSchema, body: updateProductSchema }),
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, "No autenticado");
    res.json(await updateProduct(Number(req.params.id), req.body, req.user.id));
  },
];

// PUT se mantiene por compatibilidad con clientes existentes; ambos son parciales.
productsRouter.put("/:id", ...updateHandlers);
productsRouter.patch("/:id", ...updateHandlers);

productsRouter.delete("/:id", requireRole("admin"), validate({ params: idParamSchema }), async (req, res) => {
  res.json(await deleteProduct(Number(req.params.id)));
});
