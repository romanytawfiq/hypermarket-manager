import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { dbConnect, withTransaction } from "@/lib/db";
import { requirePermission } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { recordAudit } from "@/services/audit.service";
import { CashierShiftModel } from "@/models/cashier-shift";
import { SaleModel, type Payment, type SaleDocument } from "@/models/sale";
import { ProductModel } from "@/models/product";
import { nextSequenceValue } from "@/models/sequence";
import { consumeStockForSale, getSellableStock } from "@/services/inventory.service";
import { isCashMethod, paymentMethodLabel, type PaymentMethod } from "@/lib/sales/constants";
import type { SaleCreateInput } from "@/lib/validations/sales";
import { getActiveShift } from "@/services/shift.service";

/**
 * POS sales core (Phase 4).
 *
 * Create-sale is the canonical retail money path. It is a single MongoDB
 * transaction so the sale, its sale items, payments, inventory decrease, stock
 * movements, shift association, and audit either all commit or all roll back
 * (architecture §9 aggregate root "Sale"; §48 atomicity). The server is the
 * sole authority for prices, totals, and stock (BR-001, BR-007).
 *
 * Idempotency: a client-generated `idempotencyKey` (unique index) makes retries
 * safe — re-submitting the same key returns the existing sale without a second
 * inventory deduction (architecture §9, duplicate-operation protection).
 */

const INVOICE_PREFIX = "INV";
const POS_SEARCH_LIMIT = 20;
const BARCODE_SEARCH_LIMIT = 8;

export interface SaleItemDto {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  cost: number;
  discount: number;
}

export interface PaymentDto {
  method: Payment["method"];
  amount: number;
  status: Payment["status"];
}

export interface SaleDto {
  id: string;
  invoiceNumber: string;
  cashier: { id: string; username: string };
  shiftId: string;
  customerName: string;
  items: SaleItemDto[];
  totalAmount: number;
  paymentState: string;
  payments: PaymentDto[];
  status: string;
  cashTendered: number | null;
  change: number | null;
  createdAt: string;
}

/** POS search result: id + identifying fields + sellable stock. */
export interface PosProductDto {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  unit: string;
  sellingPrice: number;
  trackExpiry: boolean;
  sellable: number;
}

function toSaleDto(sale: SaleDocument): SaleDto {
  return {
    id: sale._id.toString(),
    invoiceNumber: sale.invoiceNumber,
    cashier: { id: sale.cashier?.id ?? "", username: sale.cashier?.username ?? "" },
    shiftId: sale.shift.toString(),
    customerName: sale.customer?.name ?? "",
    items: (sale.items ?? []).map((i) => ({
      productId: (i.product as { toString?: () => string } | string)?.toString?.() ?? String(i.product),
      productName: i.productName,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
      cost: i.cost,
      discount: i.discount,
    })),
    totalAmount: sale.totalAmount,
    paymentState: sale.paymentState,
    payments: (sale.payments ?? []).map((p) => ({
      method: p.method,
      amount: p.amount,
      status: p.status,
    })),
    status: sale.status,
    cashTendered: sale.cashTendered ?? null,
    change: sale.change ?? null,
    createdAt: sale.createdAt ? new Date(sale.createdAt as unknown as Date).toISOString() : "",
  };
}

/** Returns the cashier's active (OPEN) shift id, or null. */
async function activeShiftId(cashierId: string): Promise<string | null> {
  const shift = await CashierShiftModel.findOne({ cashierId, status: "OPEN" })
    .sort({ openedAt: -1 })
    .select("_id")
    .lean<{ _id: mongoose.Types.ObjectId }>();
  return shift ? shift._id.toString() : null;
}

/**
 * POS product search by name / barcode / SKU. Barcode matches are prioritized
 * for the scan->add workflow. Requires `sales.create`.
 */
export async function posSearchProducts(
  actor: AuthUser | null,
  query: string,
): Promise<PosProductDto[]> {
  requirePermission(actor, "sales.create");
  await dbConnect();

  const q = query.trim();
  if (!q) return [];

  // Exact barcode first (critical scanner workflow), then broad text search.
  const exact = await ProductModel.find({ active: true, barcode: q })
    .limit(BARCODE_SEARCH_LIMIT)
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        name: string;
        barcode?: string;
        sku?: string;
        unit: string;
        sellingPrice: number;
        trackExpiry: boolean;
      }>
    >();

  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const broad = await ProductModel.find({
    active: true,
    $or: [{ name: { $regex: re } }, { sku: { $regex: re } }, { barcode: { $regex: re } }],
  })
    .limit(POS_SEARCH_LIMIT)
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        name: string;
        barcode?: string;
        sku?: string;
        unit: string;
        sellingPrice: number;
        trackExpiry: boolean;
      }>
    >();

  const seen = new Set<string>();
  const merged = [...exact, ...broad].filter((p) => {
    const id = p._id.toString();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const stock = await Promise.all(
    merged.map(async (p) => {
      const s = await getSellableStock(p._id.toString(), p.trackExpiry);
      return { sellable: s.sellable };
    }),
  );

  return merged.map((p, i) => ({
    id: p._id.toString(),
    name: p.name,
    barcode: p.barcode ?? null,
    sku: p.sku ?? null,
    unit: p.unit,
    sellingPrice: p.sellingPrice,
    trackExpiry: p.trackExpiry,
    sellable: stock[i]?.sellable ?? 0,
  }));
}

/**
 * Creates a completed sale. The server validates products, computes all totals,
 * validates payments, and consumes stock atomically with the shift association.
 * Requires `sales.create` and an active OPEN shift for the cashier.
 */
export async function createSale(
  actor: AuthUser | null,
  input: SaleCreateInput,
): Promise<SaleDto> {
  const authed = requirePermission(actor, "sales.create");
  await dbConnect();

  const shiftId = await activeShiftId(authed.id);
  if (!shiftId) {
    throw new AppError("CONFLICT", "افتح وردية أولاً قبل البدء بالبيع");
  }

  return withTransaction(async (session) => {
    // Idempotency: replaying the same key returns the existing sale (no re-deduct).
    if (input.idempotencyKey) {
      const existing = await SaleModel.findOne({ idempotencyKey: input.idempotencyKey })
        .session(session)
        .lean<SaleDocument>();
      if (existing) {
        return toSaleDto(existing);
      }
    }

    // Build items with server-authoritative data (price snapshot, cost snapshot).
    const saleItems: Array<{
      product: mongoose.Types.ObjectId;
      productName: string;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
      cost: number;
      trackExpiry: boolean;
    }> = [];
    let totalAmount = 0;

    for (const item of input.items) {
      const product = await ProductModel.findById(item.productId)
        .session(session)
        .select("name sellingPrice purchaseCost trackExpiry active unit")
        .lean<{
          _id: mongoose.Types.ObjectId;
          name: string;
          sellingPrice: number;
          purchaseCost: number;
          trackExpiry: boolean;
          active: boolean;
          unit: string;
        }>();
      if (!product) {
        throw new AppError("NOT_FOUND", "أحد المنتجات غير موجود");
      }
      if (!product.active) {
        throw new AppError("CONFLICT", `المنتج '${product.name}' غير متاح للبيع`);
      }

      // Revalidate current sellable stock server-side (BR-010 / architecture §10).
      const stock = await getSellableStock(item.productId, product.trackExpiry);
      if (stock.sellable < item.quantity) {
        throw new AppError(
          "CONFLICT",
          `لا يوجد مخزون كافٍ من '${product.name}'. المتاح: ${stock.sellable} ${product.unit}`,
        );
      }

      const unitPrice = Math.round(product.sellingPrice * 100) / 100;
      const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100;
      totalAmount = Math.round((totalAmount + lineTotal) * 100) / 100;
      saleItems.push({
        product: product._id,
        productName: product.name,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
        cost: Math.round(product.purchaseCost * 100) / 100,
        trackExpiry: product.trackExpiry,
      });
    }

    // Validate payments: must fully pay the total (BR-009); Phase 4 is PAID-only.
    const payments: Array<{ method: PaymentMethod; amount: number; status: "CONFIRMED" }> =
      input.payments.map((p) => ({ method: p.method as PaymentMethod, amount: p.amount, status: "CONFIRMED" }));
    const paidTotal = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    if (Math.abs(paidTotal - totalAmount) > 0.001) {
      throw new AppError(
        "VALIDATION",
        `المبلغ المدفوع (${paidTotal.toLocaleString("ar-EG")} ج.م) لا يساوي إجمالي الفاتورة (${totalAmount.toLocaleString("ar-EG")} ج.م)`,
      );
    }

    // Cash change calculation (server-side, BR-001).
    let cashTendered: number | undefined;
    let change = 0;
    const cashPaid = payments.filter((p) => isCashMethod(p.method)).reduce((s, p) => s + p.amount, 0);
    if (input.cashTendered !== undefined && input.cashTendered > 0 && cashPaid > 0) {
      if (input.cashTendered < cashPaid - 0.001) {
        throw new AppError("VALIDATION", "المبلغ النقدي المدفوع أقل من المبلغ المستحق نقدًا");
      }
      cashTendered = Math.round(input.cashTendered * 100) / 100;
      change = Math.round((cashTendered - cashPaid) * 100) / 100;
    }

    // Concurrency-safe invoice number (atomic sequence).
    const now = new Date();
    const dayKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const seq = await nextSequenceValue(`sale-${dayKey}`, session);
    const invoiceNumber = `${INVOICE_PREFIX}-${dayKey}-${String(seq).padStart(4, "0")}`;

    const [sale] = await SaleModel.create(
      [
        {
          invoiceNumber,
          cashier: { id: authed.id, username: authed.username },
          shift: new mongoose.Types.ObjectId(shiftId),
          customer: input.customerName ? { name: input.customerName.trim() } : undefined,
          items: saleItems.map((i) => ({
            product: i.product,
            productName: i.productName,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            lineTotal: i.lineTotal,
            cost: i.cost,
            discount: 0,
          })),
          totalAmount,
          paymentState: "PAID",
          payments,
          status: "COMPLETED",
          cashTendered,
          change: change > 0 ? change : 0,
          idempotencyKey: input.idempotencyKey,
          createdBy: { id: authed.id, username: authed.username },
        },
      ],
      { session },
    );
    if (!sale) throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء حفظ البيع");

    // Decrease inventory atomically (SALE movements + FEFO batches + version guard).
    await consumeStockForSale(
      authed,
      saleItems.map((i) => ({
        productId: i.product.toString(),
        productName: i.productName,
        quantity: i.quantity,
        trackExpiry: i.trackExpiry,
      })),
      { referenceId: sale._id.toString(), session },
    );

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "sale.created",
      entity: "sale",
      entityId: sale._id.toString(),
      after: {
        invoiceNumber,
        shiftId,
        totalAmount,
        payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
        itemCount: saleItems.length,
      },
    });

    const doc = await SaleModel.findById(sale._id).session(session).lean<SaleDocument>();
    if (!doc) throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء حفظ البيع");
    return toSaleDto(doc);
  });
}

/** Lists recent sales (newest first). Requires `sales.read`. */
export async function listSales(
  actor: AuthUser | null,
  limit = 100,
): Promise<SaleDto[]> {
  requirePermission(actor, "sales.read");
  await dbConnect();
  const rows = await SaleModel.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<SaleDocument[]>();
  return rows.map(toSaleDto);
}

/** Fetches a single sale by id. Requires `sales.read`. */
export async function getSale(actor: AuthUser | null, id: string): Promise<SaleDto> {
  requirePermission(actor, "sales.read");
  await dbConnect();
  const sale = await SaleModel.findById(id).lean<SaleDocument>();
  if (!sale) throw new AppError("NOT_FOUND", "الفاتورة غير موجودة");
  return toSaleDto(sale);
}

/** Lists sales belonging to a shift. Requires `sales.read`. */
export async function listSalesByShift(
  actor: AuthUser | null,
  shiftId: string,
): Promise<SaleDto[]> {
  requirePermission(actor, "sales.read");
  await dbConnect();
  const rows = await SaleModel.find({ shift: shiftId })
    .sort({ createdAt: -1 })
    .lean<SaleDocument[]>();
  return rows.map(toSaleDto);
}

/** Gets the active shift id (for POS bootstrap). Requires `shifts.read`. */
export async function getActorActiveShiftId(actor: AuthUser | null): Promise<string | null> {
  requirePermission(actor, "shifts.read");
  await dbConnect();
  const s = await getActiveShift(actor);
  return s ? s.id : null;
}

/** Arabic label helpers for receipts/UI. */
export { paymentMethodLabel };
