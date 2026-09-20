import bcrypt from "bcryptjs";
import { eq, like } from "drizzle-orm";
import { db, pool } from "./client.js";
import {
  categories,
  products,
  saleItems,
  sales,
  stockMovements,
  users,
} from "./schema.js";

function money(value: number): string {
  return value.toFixed(2);
}

function atLocal(daysAgo: number, hour: number, minute = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function seed() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  await db
    .insert(users)
    .values([
      {
        name: "Administrador",
        email: "admin@ventas.com",
        passwordHash,
        role: "admin",
        isActive: true,
      },
      {
        name: "Vendedor",
        email: "vendedor@ventas.com",
        passwordHash,
        role: "seller",
        isActive: true,
      },
    ])
    .onConflictDoNothing({ target: users.email });

  const [admin] = await db.select().from(users).where(eq(users.email, "admin@ventas.com")).limit(1);
  if (!admin) {
    throw new Error("No se pudo crear o leer el usuario admin");
  }

  await db
    .insert(categories)
    .values([
      {
        name: "Electrónica",
        description: "Periféricos y dispositivos electrónicos",
      },
      {
        name: "Accesorios",
        description: "Cables, fundas y complementos",
      },
      {
        name: "Oficina",
        description: "Papelería y suministros de oficina",
      },
    ])
    .onConflictDoNothing({ target: categories.name });

  const categoryRows = await db.select().from(categories);
  const electronics = categoryRows.find((c) => c.name === "Electrónica");
  const accessories = categoryRows.find((c) => c.name === "Accesorios");
  const office = categoryRows.find((c) => c.name === "Oficina");

  if (!electronics || !accessories || !office) {
    throw new Error("Failed to insert demo categories");
  }

  await db
    .insert(products)
    .values([
      {
        sku: "SKU-001",
        name: "Teclado mecánico",
        description: "Teclado mecánico RGB",
        categoryId: electronics.id,
        price: "129.90",
        cost: "75.00",
        stock: 500,
        minStock: 5,
      },
      {
        sku: "SKU-002",
        name: "Mouse inalámbrico",
        description: "Mouse óptico inalámbrico",
        categoryId: electronics.id,
        price: "49.90",
        cost: "22.00",
        stock: 500,
        minStock: 8,
      },
      {
        sku: "SKU-003",
        name: "Cable USB-C",
        description: "Cable USB-C 1.5m",
        categoryId: accessories.id,
        price: "19.90",
        cost: "6.50",
        stock: 800,
        minStock: 15,
      },
      {
        sku: "SKU-004",
        name: "Resma de papel A4",
        description: "Paquete de 500 hojas",
        categoryId: office.id,
        price: "15.50",
        cost: "9.00",
        stock: 300,
        minStock: 10,
      },
    ])
    .onConflictDoNothing({ target: products.sku });

  const catalog = await db.select().from(products);
  const bySku = Object.fromEntries(catalog.map((p) => [p.sku, p]));
  const keyboard = bySku["SKU-001"];
  const mouse = bySku["SKU-002"];
  const cable = bySku["SKU-003"];
  const paper = bySku["SKU-004"];

  if (!keyboard || !mouse || !cable || !paper) {
    throw new Error("Failed to load demo products");
  }

  const existingDemo = await db
    .select({ code: sales.code })
    .from(sales)
    .where(like(sales.code, "V-DEMO-%"));
  const existingCodes = new Set(existingDemo.map((row) => row.code));

  type CatalogProduct = typeof keyboard;
  type DemoItem = { product: CatalogProduct; quantity: number };
  type DemoSale = {
    code: string;
    createdAt: Date;
    customerName: string;
    customerDocument?: string;
    paymentMethod: "cash" | "card" | "transfer" | "yape";
    status: "completed" | "cancelled";
    discount: number;
    tax: number;
    items: DemoItem[];
  };

  const catalogProducts: CatalogProduct[] = [keyboard, mouse, cable, paper];
  const customers = [
    "Ana Pérez",
    "Luis Gómez",
    "María Torres",
    "Oficina Norte SAC",
    "Pedro Salas",
    "Carla Ríos",
    "Diego Vargas",
    "Rosa Medina",
    "Colegio San Martín",
    "Jorge Paredes",
    "Elena Castro",
    "Ricardo León",
    "Sofía Núñez",
    "Andrés Quispe",
    "Paola Herrera",
    "Mini Market Luna",
    "Clínica Santa Fe",
    "Juan Delgado",
    "Valeria Ortiz",
    "Taller El Rayo",
  ];
  const methods: DemoSale["paymentMethod"][] = ["cash", "card", "transfer", "yape"];

  function dayOffsetForIndex(index: number): number {
    if (index < 8) return 0;
    if (index < 20) return 1 + (index % 7);
    if (index < 45) return 8 + ((index * 3) % 22);
    if (index < 70) return 31 + ((index * 5) % 28);
    return 60 + ((index * 7) % 120);
  }

  const allDemos: DemoSale[] = Array.from({ length: 100 }, (_, index) => {
    const n = index + 1;
    const productCount = 1 + (index % 3);
    const items: DemoItem[] = [];
    for (let i = 0; i < productCount; i += 1) {
      const product = catalogProducts[(index + i * 2) % catalogProducts.length];
      if (!product) continue;
      items.push({ product, quantity: 1 + ((index + i) % 3) });
    }

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.product.price) * item.quantity,
      0,
    );
    const hasDiscount = index % 7 === 0;
    const discount = hasDiscount ? Number((subtotal * 0.05).toFixed(2)) : 0;

    return {
      code: `V-DEMO-${String(n).padStart(2, "0")}`,
      createdAt: atLocal(dayOffsetForIndex(index), 8 + (index % 11), (index * 7) % 60),
      customerName: customers[index % customers.length] ?? "Cliente demo",
      customerDocument: index % 4 === 0 ? String(10_000_000 + index) : undefined,
      paymentMethod: methods[index % methods.length] ?? "cash",
      status: index % 13 === 0 ? "cancelled" : "completed",
      discount,
      tax: index % 5 === 0 ? Number((subtotal * 0.08).toFixed(2)) : 0,
      items,
    };
  });

  const demos = allDemos.filter((demo) => !existingCodes.has(demo.code));

  if (demos.length === 0) {
    console.log("Seed skipped: las 100 ventas demo ya existen (admin@ventas.com / admin123)");
    await pool.end();
    return;
  }

  await db.update(products).set({ stock: 500 }).where(eq(products.sku, "SKU-001"));
  await db.update(products).set({ stock: 500 }).where(eq(products.sku, "SKU-002"));
  await db.update(products).set({ stock: 800 }).where(eq(products.sku, "SKU-003"));
  await db.update(products).set({ stock: 300 }).where(eq(products.sku, "SKU-004"));

  await db.transaction(async (tx) => {
    for (const demo of demos) {
      let subtotal = 0;
      const lines = demo.items.map((item) => {
        const unitPrice = Number(item.product.price);
        const lineSubtotal = unitPrice * item.quantity;
        subtotal += lineSubtotal;
        return { ...item, unitPrice, lineSubtotal };
      });
      const total = Math.max(0, subtotal - demo.discount + demo.tax);

      const [sale] = await tx
        .insert(sales)
        .values({
          code: demo.code,
          userId: admin.id,
          customerName: demo.customerName,
          customerDocument: demo.customerDocument ?? null,
          subtotal: money(subtotal),
          discount: money(demo.discount),
          tax: money(demo.tax),
          total: money(total),
          paymentMethod: demo.paymentMethod,
          status: demo.status,
          createdAt: demo.createdAt,
        })
        .returning();

      if (!sale) {
        throw new Error(`No se pudo crear ${demo.code}`);
      }

      await tx.insert(saleItems).values(
        lines.map((line) => ({
          saleId: sale.id,
          productId: line.product.id,
          productName: line.product.name,
          quantity: line.quantity,
          unitPrice: money(line.unitPrice),
          subtotal: money(line.lineSubtotal),
        })),
      );

      if (demo.status !== "completed") {
        continue;
      }

      for (const line of lines) {
        const [current] = await tx
          .select()
          .from(products)
          .where(eq(products.id, line.product.id))
          .limit(1);
        if (!current) {
          throw new Error(`Producto ${line.product.sku} no encontrado`);
        }

        const previousStock = current.stock;
        const newStock = Math.max(0, previousStock - line.quantity);

        await tx
          .update(products)
          .set({ stock: newStock, updatedAt: demo.createdAt })
          .where(eq(products.id, line.product.id));

        await tx.insert(stockMovements).values({
          productId: line.product.id,
          type: "out",
          quantity: line.quantity,
          previousStock,
          newStock,
          reason: `Venta ${demo.code}`,
          saleId: sale.id,
          userId: admin.id,
          createdAt: demo.createdAt,
        });
      }
    }
  });

  console.log(
    `Seed complete: admin@ventas.com / admin123 + catálogo + ${demos.length} ventas demo nuevas (total objetivo 100: V-DEMO-01 … V-DEMO-100)`,
  );
  await pool.end();
}

seed().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
