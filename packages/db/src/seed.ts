/**
 * Seed de demo (idempotente): usuarios, catálogo de una tienda de tecnología y oficina
 * en Lima, y 120 ventas repartidas en los últimos ~6 meses (algunas canceladas).
 *
 * - Si las ventas `V-DEMO-*` ya existen no se duplican ni se toca el stock.
 * - Contraseñas: SEED_ADMIN_PASSWORD / SEED_SELLER_PASSWORD (por defecto `admin123`).
 *   En producción el seed exige que las definas.
 */
import bcrypt from "bcryptjs";
import { eq, like } from "drizzle-orm";
import { db, pool } from "./client.js";
import { categories, products, saleItems, sales, stockMovements, users } from "./schema.js";

const isProduction = process.env.NODE_ENV === "production";

function requiredPassword(name: string): string {
  const value = process.env[name];
  if (value && value.length >= 8) return value;
  if (isProduction) {
    throw new Error(`${name} es obligatoria (mín. 8 caracteres) para sembrar en producción`);
  }
  return "admin123";
}

/** Montos en centavos para no arrastrar errores de coma flotante. */
function toCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function atLocal(daysAgo: number, hour: number, minute = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
}

const CATEGORIES = [
  { name: "Electrónica", description: "Periféricos y dispositivos electrónicos" },
  { name: "Accesorios", description: "Cables, fundas, cargadores y complementos" },
  { name: "Oficina", description: "Papelería y suministros de oficina" },
  { name: "Audio", description: "Audífonos, parlantes y micrófonos" },
  { name: "Redes", description: "Routers, switches y conectividad" },
];

const PRODUCTS: Array<{
  sku: string;
  name: string;
  description: string;
  category: string;
  price: string;
  cost: string;
  stock: number;
  minStock: number;
}> = [
  { sku: "SKU-001", name: "Teclado mecánico", description: "Teclado mecánico RGB, switches rojos", category: "Electrónica", price: "129.90", cost: "75.00", stock: 400, minStock: 5 },
  { sku: "SKU-002", name: "Mouse inalámbrico", description: "Mouse óptico inalámbrico 2.4 GHz", category: "Electrónica", price: "49.90", cost: "22.00", stock: 400, minStock: 8 },
  { sku: "SKU-003", name: "Cable USB-C", description: "Cable USB-C a USB-C de 1,5 m, 60 W", category: "Accesorios", price: "19.90", cost: "6.50", stock: 600, minStock: 15 },
  { sku: "SKU-004", name: "Resma de papel A4", description: "Paquete de 500 hojas de 75 g", category: "Oficina", price: "15.50", cost: "9.00", stock: 300, minStock: 10 },
  { sku: "SKU-005", name: "Monitor 24\" IPS", description: "Monitor Full HD de 24 pulgadas, 75 Hz", category: "Electrónica", price: "549.00", cost: "410.00", stock: 60, minStock: 4 },
  { sku: "SKU-006", name: "Webcam Full HD", description: "Cámara web 1080p con micrófono", category: "Electrónica", price: "119.00", cost: "68.00", stock: 90, minStock: 6 },
  { sku: "SKU-007", name: "Cargador 65 W GaN", description: "Cargador USB-C de carga rápida", category: "Accesorios", price: "89.90", cost: "48.00", stock: 150, minStock: 10 },
  { sku: "SKU-008", name: "Funda para laptop 15\"", description: "Funda acolchada impermeable", category: "Accesorios", price: "39.90", cost: "17.00", stock: 120, minStock: 8 },
  { sku: "SKU-009", name: "Cuaderno A5 x 3", description: "Pack de 3 cuadernos cuadriculados", category: "Oficina", price: "18.90", cost: "8.40", stock: 220, minStock: 20 },
  { sku: "SKU-010", name: "Lapiceros azules x 12", description: "Caja de 12 lapiceros punta fina", category: "Oficina", price: "12.00", cost: "5.10", stock: 260, minStock: 20 },
  { sku: "SKU-011", name: "Audífonos Bluetooth", description: "Audífonos inalámbricos con cancelación de ruido", category: "Audio", price: "199.00", cost: "120.00", stock: 80, minStock: 6 },
  { sku: "SKU-012", name: "Parlante portátil", description: "Parlante Bluetooth resistente al agua", category: "Audio", price: "159.00", cost: "92.00", stock: 70, minStock: 5 },
  { sku: "SKU-013", name: "Micrófono USB", description: "Micrófono de condensador para streaming", category: "Audio", price: "229.00", cost: "140.00", stock: 25, minStock: 4 },
  { sku: "SKU-014", name: "Router Wi-Fi 6", description: "Router doble banda AX1800", category: "Redes", price: "279.00", cost: "190.00", stock: 35, minStock: 4 },
  { sku: "SKU-015", name: "Switch 8 puertos", description: "Switch gigabit no administrable", category: "Redes", price: "99.00", cost: "58.00", stock: 40, minStock: 3 },
  { sku: "SKU-016", name: "Cable de red Cat6 3 m", description: "Patch cord UTP Cat6", category: "Redes", price: "14.90", cost: "4.20", stock: 18, minStock: 20 },
];

const CUSTOMERS = [
  "Ana Pérez", "Luis Gómez", "María Torres", "Oficina Norte SAC", "Pedro Salas",
  "Carla Ríos", "Diego Vargas", "Rosa Medina", "Colegio San Martín", "Jorge Paredes",
  "Elena Castro", "Ricardo León", "Sofía Núñez", "Andrés Quispe", "Paola Herrera",
  "Mini Market Luna", "Clínica Santa Fe", "Juan Delgado", "Valeria Ortiz", "Taller El Rayo",
];

const METHODS = ["cash", "card", "transfer", "yape"] as const;
const DEMO_COUNT = 120;

async function seed() {
  const adminHash = await bcrypt.hash(requiredPassword("SEED_ADMIN_PASSWORD"), 10);
  const sellerHash = await bcrypt.hash(requiredPassword("SEED_SELLER_PASSWORD"), 10);
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@ventas.com";
  const sellerEmail = process.env.SEED_SELLER_EMAIL ?? "vendedor@ventas.com";

  await db
    .insert(users)
    .values([
      { name: "Administrador", email: adminEmail, passwordHash: adminHash, role: "admin", isActive: true },
      { name: "Lucía Vendedora", email: sellerEmail, passwordHash: sellerHash, role: "seller", isActive: true },
    ])
    .onConflictDoNothing({ target: users.email });

  const [admin] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  const [seller] = await db.select().from(users).where(eq(users.email, sellerEmail)).limit(1);
  if (!admin || !seller) {
    throw new Error("No se pudieron crear o leer los usuarios demo");
  }

  await db.insert(categories).values(CATEGORIES).onConflictDoNothing({ target: categories.name });
  const categoryRows = await db.select().from(categories);
  const categoryId = (name: string) => {
    const row = categoryRows.find((c) => c.name === name);
    if (!row) throw new Error(`Categoría ${name} no encontrada`);
    return row.id;
  };

  await db
    .insert(products)
    .values(
      PRODUCTS.map((p) => ({
        sku: p.sku,
        name: p.name,
        description: p.description,
        categoryId: categoryId(p.category),
        price: p.price,
        cost: p.cost,
        stock: p.stock,
        minStock: p.minStock,
      })),
    )
    .onConflictDoNothing({ target: products.sku });

  const existingDemo = await db
    .select({ code: sales.code })
    .from(sales)
    .where(like(sales.code, "V-DEMO-%"));
  const existingCodes = new Set(existingDemo.map((row) => row.code));

  const catalog = await db.select().from(products);
  const bySku = new Map(catalog.map((p) => [p.sku, p]));
  // Los productos de mayor rotación aparecen más en las ventas demo.
  const weighted = ["SKU-001", "SKU-002", "SKU-003", "SKU-003", "SKU-004", "SKU-004", "SKU-005",
    "SKU-006", "SKU-007", "SKU-008", "SKU-009", "SKU-010", "SKU-010", "SKU-011", "SKU-012",
    "SKU-013", "SKU-014", "SKU-015", "SKU-016"]
    .map((sku) => bySku.get(sku))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  function dayOffsetForIndex(index: number): number {
    if (index < 8) return 0;
    if (index < 22) return 1 + (index % 7);
    if (index < 50) return 8 + ((index * 3) % 22);
    if (index < 80) return 31 + ((index * 5) % 28);
    return 60 + ((index * 7) % 120);
  }

  const demos = Array.from({ length: DEMO_COUNT }, (_, index) => {
    const lines = new Map<number, { product: (typeof weighted)[number]; quantity: number }>();
    const productCount = 1 + (index % 3);
    for (let i = 0; i < productCount; i += 1) {
      const product = weighted[(index * 5 + i * 3) % weighted.length];
      if (!product) continue;
      const current = lines.get(product.id);
      const quantity = 1 + ((index + i) % 3);
      lines.set(product.id, { product, quantity: (current?.quantity ?? 0) + quantity });
    }
    const items = [...lines.values()];
    const subtotalCents = items.reduce((sum, item) => sum + toCents(item.product.price) * item.quantity, 0);
    const discountCents = index % 7 === 0 ? Math.round(subtotalCents * 0.05) : 0;
    const taxCents = index % 5 === 0 ? Math.round((subtotalCents - discountCents) * 0.18) : 0;
    const cancelled = index % 13 === 0;
    const createdAt = atLocal(dayOffsetForIndex(index), 9 + (index % 11), (index * 7) % 60);
    return {
      code: `V-DEMO-${String(index + 1).padStart(3, "0")}`,
      createdAt,
      userId: index % 3 === 0 ? admin.id : seller.id,
      customerName: index % 6 === 5 ? null : (CUSTOMERS[index % CUSTOMERS.length] ?? null),
      customerDocument: index % 4 === 0 ? String(10_000_000 + index * 7919) : null,
      paymentMethod: METHODS[index % METHODS.length] ?? "cash",
      cancelled,
      subtotalCents,
      discountCents,
      taxCents,
      items,
    };
  }).filter((demo) => !existingCodes.has(demo.code));

  if (demos.length === 0) {
    console.log(`Seed omitido: las ventas demo ya existen (${adminEmail} / ${sellerEmail})`);
    await pool.end();
    return;
  }

  // Orden cronológico para que el historial de stock sea coherente.
  demos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  await db.transaction(async (tx) => {
    for (const demo of demos) {
      const totalCents = Math.max(0, demo.subtotalCents - demo.discountCents + demo.taxCents);
      const [sale] = await tx
        .insert(sales)
        .values({
          code: demo.code,
          userId: demo.userId,
          customerName: demo.customerName,
          customerDocument: demo.customerDocument,
          subtotal: fromCents(demo.subtotalCents),
          discount: fromCents(demo.discountCents),
          tax: fromCents(demo.taxCents),
          total: fromCents(totalCents),
          paymentMethod: demo.paymentMethod,
          status: demo.cancelled ? "cancelled" : "completed",
          cancelledAt: demo.cancelled ? new Date(demo.createdAt.getTime() + 20 * 60_000) : null,
          cancelledBy: demo.cancelled ? admin.id : null,
          cancelReason: demo.cancelled ? "Cliente desistió de la compra" : null,
          createdAt: demo.createdAt,
        })
        .returning();
      if (!sale) throw new Error(`No se pudo crear ${demo.code}`);

      await tx.insert(saleItems).values(
        demo.items.map((line) => ({
          saleId: sale.id,
          productId: line.product.id,
          productName: line.product.name,
          quantity: line.quantity,
          unitPrice: line.product.price,
          unitCost: line.product.cost,
          subtotal: fromCents(toCents(line.product.price) * line.quantity),
        })),
      );

      if (demo.cancelled) continue;

      for (const line of demo.items) {
        const [current] = await tx.select().from(products).where(eq(products.id, line.product.id)).limit(1);
        if (!current) throw new Error(`Producto ${line.product.sku} no encontrado`);
        const previousStock = current.stock;
        const newStock = Math.max(0, previousStock - line.quantity);
        await tx
          .update(products)
          .set({ stock: newStock, updatedAt: demo.createdAt })
          .where(eq(products.id, line.product.id));
        await tx.insert(stockMovements).values({
          productId: line.product.id,
          type: "out",
          quantity: previousStock - newStock,
          previousStock,
          newStock,
          reason: `Venta ${demo.code}`,
          saleId: sale.id,
          userId: demo.userId,
          createdAt: demo.createdAt,
        });
      }
    }
  });

  console.log(
    `Seed completo: ${adminEmail} (admin) y ${sellerEmail} (vendedor), ${PRODUCTS.length} productos y ${demos.length} ventas demo nuevas`,
  );
  await pool.end();
}

seed().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
