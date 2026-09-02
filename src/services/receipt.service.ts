import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { dbConnect } from "@/lib/db";
import { requirePermission } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { SaleModel, type SalePaymentState } from "@/models/sale";
import { CafeOrderModel } from "@/models/cafe-order";
import { CustomerPaymentModel } from "@/models/customer-payment";
import { CustomerModel } from "@/models/customer";
import { paymentMethodLabel, type PaymentMethod } from "@/lib/sales/constants";
import { sugarLabel } from "@/lib/cafe/sugar";

/**
 * Receipt view models (Phase 8).
 *
 * One authoritative, server-side data load per printable document. A receipt
 * always derives from *persisted* transaction records (the immutable Sale as
 * the source of truth for retail, the Café order + its linked Sale, or a
 * CustomerPayment) — never from cart state, client totals, or live catalog
 * prices. Item names and unit prices are printed from the stored snapshots so
 * a later price change can never corrupt an already-issued receipt.
 *
 * Authorization reuses the existing permission system: every loader requires
 * `receipts.print` plus the read permission of the underlying record. Lookups
 * are scoped to the authenticated session user server-side (no client-supplied
 * identity, no IDOR surface beyond what the permission system already grants).
 *
 * Store identity (name/tagline/footer) is presentation-config, not document
 * data, so it is injected by the renderer from `lib/printing/config`.
 */

const RECEIPT_NOT_FOUND_SALE = "الفاتورة غير موجودة";
const RECEIPT_NOT_FOUND_ORDER = "طلب الكافيه غير موجود";
const RECEIPT_NOT_FOUND_PAYMENT = "إيصال السداد غير موجود";

export type ReceiptDocumentKind = "sale" | "cafe-order" | "customer-payment";

/** One printed item/session line (snapshotted values only). */
export interface ReceiptLineItem {
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  /** Optional Arabic note printed under the item (e.g. café sugar level). */
  note?: string;
}

export interface ReceiptPaymentItem {
  method: PaymentMethod;
  /** Arabic payment-method label resolved server-side. */
  methodLabel: string;
  amount: number;
}

export interface ReceiptViewModel {
  kind: ReceiptDocumentKind;
  /**
   * Primary reference printed in the document header:
   *  - sale            → Invoice number (INV-…)
   *  - cafe-order      → Order number (CF-…)
   *  - customer-payment→ Payment receipt number (PYMT-…)
   */
  referenceNumber: string;
  /** Café only: the order number (CF-…). */
  orderNumber?: string;
  /** Café only: the linked sale invoice number (INV-…). */
  invoiceNumber?: string;
  /** Acting user username snapshot. */
  actorUsername: string;
  /** ISO timestamp of the transaction. */
  createdAt: string;
  customerName?: string;
  items: ReceiptLineItem[];
  totalAmount: number;
  payments: ReceiptPaymentItem[];
  totalPaid: number;
  balanceDue: number;
  paymentState: SalePaymentState;
  cashTendered: number | null;
  change: number | null;
}

interface SaleLean {
  _id: mongoose.Types.ObjectId;
  invoiceNumber: string;
  cashier?: { id?: string; username?: string };
  customer?: { id?: string; name?: string };
  items: Array<{
    productName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
  totalAmount: number;
  totalPaid: number;
  balanceDue: number;
  paymentState: SalePaymentState;
  payments: Array<{ method: PaymentMethod; amount: number }>;
  cashTendered?: number;
  change?: number;
  createdAt?: Date;
}

interface CafeOrderLean {
  _id: mongoose.Types.ObjectId;
  orderNumber: string;
  saleId?: string;
  invoiceNumber?: string;
  customerName?: string;
  items: Array<{
    productName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    sugarLevel?: string;
    notes?: string;
  }>;
  createdBy?: { id?: string; username?: string };
  createdAt?: Date;
}

interface CustomerPaymentLean {
  _id: mongoose.Types.ObjectId;
  paymentNumber: string;
  customer: mongoose.Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  createdBy?: { id?: string; username?: string };
  paymentDate?: Date;
}

function assertValidId(id: string, message: string): void {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("NOT_FOUND", message);
  }
}

function noteFor(orderItem: CafeOrderLean["items"][number]): string | undefined {
  const parts: string[] = [];
  if (orderItem.sugarLevel) {
    parts.push(`سكرية: ${sugarLabel(orderItem.sugarLevel)}`);
  }
  if (orderItem.notes) {
    parts.push(`ملاحظة: ${orderItem.notes}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function saleToReceiptViewModel(sale: SaleLean, kind: ReceiptDocumentKind): ReceiptViewModel {
  return {
    kind,
    referenceNumber: sale.invoiceNumber,
    actorUsername: sale.cashier?.username ?? "",
    createdAt: sale.createdAt?.toISOString() ?? new Date(0).toISOString(),
    customerName: sale.customer?.name || undefined,
    items: sale.items.map((i) => ({
      name: i.productName,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    totalAmount: sale.totalAmount,
    payments: (sale.payments ?? []).map((p) => ({
      method: p.method,
      methodLabel: paymentMethodLabel(p.method),
      amount: p.amount,
    })),
    totalPaid: sale.totalPaid,
    balanceDue: sale.balanceDue,
    paymentState: sale.paymentState,
    cashTendered: sale.cashTendered ?? null,
    change: sale.change ?? null,
  };
}

/**
 * Builds the receipt view model for a retail sale. The sale is stored history,
 * so printed unit prices are the snapshot at the time of sale — never the
 * current catalog price.
 */
export async function getSaleReceiptViewModel(
  actor: AuthUser | null,
  saleId: string,
): Promise<ReceiptViewModel> {
  requirePermission(actor, ["receipts.print", "sales.read"]);
  await dbConnect();
  assertValidId(saleId, RECEIPT_NOT_FOUND_SALE);

  const sale = await SaleModel.findById(saleId).lean<SaleLean | null>();
  if (!sale) throw new AppError("NOT_FOUND", RECEIPT_NOT_FOUND_SALE);

  return saleToReceiptViewModel(sale, "sale");
}

/**
 * Builds the receipt view model for a café order. Line items (including the
 * per-cup sugar level) come from the persisted order; financial figures
 * (totals, payments, cash/change) come from the linked immutable Sale, which is
 * authoritative and can never diverge from the order.
 */
export async function getCafeReceiptViewModel(
  actor: AuthUser | null,
  cafeOrderId: string,
): Promise<ReceiptViewModel> {
  requirePermission(actor, ["receipts.print", "cafe.orders.read"]);
  await dbConnect();
  assertValidId(cafeOrderId, RECEIPT_NOT_FOUND_ORDER);

  const order = await CafeOrderModel.findById(cafeOrderId).lean<CafeOrderLean | null>();
  if (!order) throw new AppError("NOT_FOUND", RECEIPT_NOT_FOUND_ORDER);

  if (!order.saleId) {
    throw new AppError("NOT_FOUND", "لا توجد فاتورة مرتبطة بهذا الطلب");
  }
  if (!mongoose.isValidObjectId(order.saleId)) {
    throw new AppError("NOT_FOUND", "لا توجد فاتورة مرتبطة بهذا الطلب");
  }

  const sale = await SaleModel.findById(order.saleId).lean<SaleLean | null>();
  if (!sale) throw new AppError("NOT_FOUND", "لا توجد فاتورة مرتبطة بهذا الطلب");

  const vm = saleToReceiptViewModel(sale, "cafe-order");
  return {
    ...vm,
    referenceNumber: order.orderNumber,
    orderNumber: order.orderNumber,
    invoiceNumber: sale.invoiceNumber,
    actorUsername: order.createdBy?.username ?? sale.cashier?.username ?? "",
    createdAt: order.createdAt?.toISOString() ?? vm.createdAt,
    customerName: sale.customer?.name || order.customerName || undefined,
    items: order.items.map((i) => ({
      name: i.productName,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
      note: noteFor(i),
    })),
  };
}

/**
 * Builds the receipt view model for a customer payment (إيصال سداد). The
 * payment is immutable history (BR-013); the printed amount and method are the
 * recorded values.
 */
export async function getCustomerPaymentReceiptViewModel(
  actor: AuthUser | null,
  paymentId: string,
): Promise<ReceiptViewModel> {
  requirePermission(actor, ["receipts.print", "customer_payments.read"]);
  await dbConnect();
  assertValidId(paymentId, RECEIPT_NOT_FOUND_PAYMENT);

  const payment = await CustomerPaymentModel.findById(paymentId).lean<CustomerPaymentLean | null>();
  if (!payment) throw new AppError("NOT_FOUND", RECEIPT_NOT_FOUND_PAYMENT);

  const customer = await CustomerModel.findOne({
    _id: payment.customer,
  })
    .select({ name: 1 })
    .lean<{ _id: mongoose.Types.ObjectId; name: string } | null>();

  const customerName = customer?.name ?? "";
  const createdAt =
    payment.paymentDate?.toISOString() ?? new Date(0).toISOString();

  return {
    kind: "customer-payment",
    referenceNumber: payment.paymentNumber,
    actorUsername: payment.createdBy?.username ?? "",
    createdAt,
    customerName: customerName || undefined,
    items: [
      {
        name: "تحصيل دفعة من العميل",
        unitPrice: payment.amount,
        quantity: 1,
        lineTotal: payment.amount,
      },
    ],
    totalAmount: payment.amount,
    payments: [
      {
        method: payment.method,
        methodLabel: paymentMethodLabel(payment.method),
        amount: payment.amount,
      },
    ],
    totalPaid: payment.amount,
    balanceDue: 0,
    paymentState: "PAID",
    cashTendered: null,
    change: null,
  };
}