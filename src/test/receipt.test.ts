import { describe, it, expect, beforeAll } from "vitest";
import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { SaleModel } from "@/models/sale";
import { ProductModel } from "@/models/product";
import { createCategory, createProduct } from "@/services/catalog.service";
import { openShift } from "@/services/shift.service";
import { receivePurchaseStock } from "@/services/inventory.service";
import { createSale } from "@/services/sales.service";
import { createCafeOrder } from "@/services/cafe.service";
import {
  createCustomer,
  createCustomerPayment,
} from "@/services/customer.service";
import {
  getSaleReceiptViewModel,
  getCafeReceiptViewModel,
  getCustomerPaymentReceiptViewModel,
} from "@/services/receipt.service";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

let counter = 0;

async function freshActor(role: "MANAGER" | "CASHIER" | "BARISTA" | "WAREHOUSE_EMPLOYEE") {
  counter += 1;
  const u = await createUser({ username: `${role.toLowerCase()}-rcpt-${counter}`, role });
  return buildAuthUser(u);
}

describe("receipt view models (Phase 8)", () => {
  let manager: Awaited<ReturnType<typeof buildAuthUser>>;

  beforeAll(async () => {
    await resetDb();
    manager = await freshActor("MANAGER");
  });

  async function newCashier() {
    return freshActor("CASHIER");
  }

  async function makeProduct(name: string, price: number, opts: { stock?: number; supportsSugarOptions?: boolean } = {}) {
    const cat = await createCategory(manager, {
      name: `فئة ${name}`,
      supportsSugarOptions: opts.supportsSugarOptions ?? false,
    });
    const p = await createProduct(manager, {
      name,
      categoryId: cat.id,
      unit: "قطعة",
      purchaseCost: Math.round(price * 0.5),
      sellingPrice: price,
      minimumStock: 0,
      trackExpiry: false,
    });
    if ((opts.stock ?? 0) > 0) {
      const stock = opts.stock ?? 0;
      await receivePurchaseStock(
        manager,
        [{ productId: p.id, productName: name, quantity: stock, trackExpiry: false }],
        {},
      );
    }
    return p.id;
  }

  it("builds a sale receipt from the persisted sale (snapshot prices, payments, cashier)", async () => {
    const cashier = await newCashier();
    await openShift(cashier, { openingCash: 100 });
    const productId = await makeProduct("كولا اختبار", 25, { stock: 20 });

    const sale = await createSale(cashier, {
      items: [{ productId, quantity: 2 }],
      payments: [
        { method: "CASH", amount: 30 },
        { method: "VISA", amount: 20 },
      ],
      idempotencyKey: crypto.randomUUID(),
      customerName: "أحمد",
      cashTendered: 30,
    });

    // Mutate the catalog price after the sale: the printed receipt must keep the snapshot.
    await ProductModel.updateOne({ _id: productId }, { $set: { sellingPrice: 999 } });

    const vm = await getSaleReceiptViewModel(cashier, sale.id);
    expect(vm.kind).toBe("sale");
    expect(vm.referenceNumber).toBe(sale.invoiceNumber);
    expect(vm.actorUsername).toBe(cashier.username);
    expect(vm.customerName).toBe("أحمد");
    expect(vm.items).toHaveLength(1);
    expect(vm.items[0]).toMatchObject({
      name: "كولا اختبار",
      unitPrice: 25,
      quantity: 2,
      lineTotal: 50,
    });
    expect(vm.totalAmount).toBe(50);
    expect(vm.totalPaid).toBe(50);
    expect(vm.balanceDue).toBe(0);
    expect(vm.paymentState).toBe("PAID");
    expect(vm.payments.map((p) => p.method)).toEqual(["CASH", "VISA"]);
    expect(vm.payments.map((p) => p.methodLabel)).toEqual(["نقدي", "فيزا"]);
    expect(vm.cashTendered).toBe(30);
  });

  it("keeps the printed change and credit rows for a partial (credit) sale", async () => {
    const cashier = await newCashier();
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct("عصير آجل", 40, { stock: 10 });
    const customer = await createCustomer(manager, { name: "عميل آجل", allowCredit: true });

    const sale = await createSale(cashier, {
      items: [{ productId, quantity: 2 }],
      payments: [{ method: "CASH", amount: 30 }],
      customerId: customer.id,
      onCredit: true,
      idempotencyKey: crypto.randomUUID(),
    });

    const vm = await getSaleReceiptViewModel(cashier, sale.id);
    expect(vm.totalAmount).toBe(80);
    expect(vm.totalPaid).toBe(30);
    expect(vm.balanceDue).toBe(50);
    expect(vm.paymentState).toBe("PARTIAL");
    expect(vm.customerName).toBe("عميل آجل");
  });

  it("builds a café receipt from the order + its linked sale (sugar labels, order + invoice numbers)", async () => {
    const cashier = await newCashier();
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct("قهوة تركية", 25, { stock: 50, supportsSugarOptions: true });

    const order = await createCafeOrder(cashier, {
      items: [{ productId, quantity: 1, sugarLevel: "EXTRA", notes: "سكر زيادة" }],
      payments: [{ method: "CASH", amount: 25 }],
      idempotencyKey: crypto.randomUUID(),
    });

    expect(order.saleId).toBeTruthy();
    const sale = await SaleModel.findById(order.saleId).lean<{
      totalAmount: number;
      invoiceNumber: string;
    }>();
    expect(sale).not.toBeNull();
    if (!sale) throw new Error("expected a linked sale");

    const vm = await getCafeReceiptViewModel(cashier, order.id);
    expect(vm.kind).toBe("cafe-order");
    expect(vm.referenceNumber).toBe(order.orderNumber);
    expect(vm.orderNumber).toBe(order.orderNumber);
    expect(vm.invoiceNumber).toBe(order.invoiceNumber);
    expect(vm.totalAmount).toBe(25);
    expect(vm.paymentState).toBe("PAID");
    expect(vm.items).toHaveLength(1);
    expect(vm.items[0]).toMatchObject({
      name: "قهوة تركية",
      unitPrice: 25,
      quantity: 1,
      lineTotal: 25,
    });
    expect(vm.items[0]?.note).toContain("سكرية: زيادة");
    expect(vm.items[0]?.note).toContain("ملاحظة: سكر زيادة");
    // Financial authority stays with the linked Sale.
    expect(vm.totalAmount).toBe(sale?.totalAmount);
    expect(vm.invoiceNumber).toBe(sale?.invoiceNumber);
  });

  it("builds a customer-payment receipt (إيصال سداد) from the persisted payment", async () => {
    const cashier = await newCashier();
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct("سداد آجل", 60, { stock: 10 });
    const customer = await createCustomer(manager, { name: "عميل سداد" });

    await createSale(cashier, {
      items: [{ productId, quantity: 1 }],
      payments: [{ method: "CASH", amount: 10 }],
      customerId: customer.id,
      onCredit: true,
      idempotencyKey: crypto.randomUUID(),
    });

    const payment = await createCustomerPayment(cashier, {
      customerId: customer.id,
      amount: 50,
      method: "VISA",
      idempotencyKey: crypto.randomUUID(),
    });

    const vm = await getCustomerPaymentReceiptViewModel(cashier, payment.id);
    expect(vm.kind).toBe("customer-payment");
    expect(vm.referenceNumber).toBe(payment.paymentNumber);
    expect(vm.customerName).toBe("عميل سداد");
    expect(vm.totalAmount).toBe(50);
    expect(vm.payments).toHaveLength(1);
    expect(vm.payments[0]).toMatchObject({ method: "VISA", methodLabel: "فيزا", amount: 50 });
    expect(vm.actorUsername).toBe(cashier.username);
  });

  it("is server-authorized: only `receipts.print` holders may load receipt documents", async () => {
    const cashier = await newCashier();
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct("صلاحيات", 10, { stock: 5 });
    const customer = await createCustomer(manager, { name: "صلاحيات" });

    const sale = await createSale(cashier, {
      items: [{ productId, quantity: 1 }],
      payments: [{ method: "CASH", amount: 10 }],
      customerId: customer.id,
      onCredit: true,
      idempotencyKey: crypto.randomUUID(),
    });
    const payment = await createCustomerPayment(cashier, {
      customerId: customer.id,
      amount: 10,
      method: "CASH",
      idempotencyKey: crypto.randomUUID(),
    });

    const warehouse = await freshActor("WAREHOUSE_EMPLOYEE");
    const barista = await freshActor("BARISTA");

    // Warehouse has neither `receipts.print` nor `customer_payments.read`.
    await expect(getSaleReceiptViewModel(warehouse, sale.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getCustomerPaymentReceiptViewModel(warehouse, payment.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    // BARISTA has café order read rights but not `receipts.print` → forbidden.
    await expect(getCafeReceiptViewModel(barista, new mongoose.Types.ObjectId().toString())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns NOT_FOUND for unknown / invalid ids (no data leakage to valid users)", async () => {
    const cashier = await newCashier();
    await openShift(cashier, { openingCash: 0 });
    const unknownId = new mongoose.Types.ObjectId().toString();

    await expect(getSaleReceiptViewModel(cashier, unknownId)).rejects.toBeInstanceOf(AppError);
    await expect(getSaleReceiptViewModel(cashier, unknownId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getCafeReceiptViewModel(cashier, unknownId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getCustomerPaymentReceiptViewModel(cashier, unknownId)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Invalid object ids never reach the database.
    await expect(getSaleReceiptViewModel(cashier, "not-an-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getCustomerPaymentReceiptViewModel(cashier, "not-an-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects anonymous access", async () => {
    await expect(getSaleReceiptViewModel(null, new mongoose.Types.ObjectId().toString())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      getCustomerPaymentReceiptViewModel(null, new mongoose.Types.ObjectId().toString()),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});