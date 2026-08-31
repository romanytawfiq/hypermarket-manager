import { describe, it, expect, beforeAll } from "vitest";
import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import {
  listExpenseCategories,
  createExpenseCategory,
  setExpenseCategoryActive,
  createExpense,
  listExpenses,
} from "@/services/expense.service";
import { openShift, computeExpectedCash } from "@/services/shift.service";
import { CashMovementModel } from "@/models/cash-movement";
import { ExpenseModel } from "@/models/expense";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

let freshCounter = 0;
/** A distinct CASHIER with no pre-existing open shift (for shift-linkage tests). */
async function freshCashier(prefix: string) {
  freshCounter += 1;
  const u = await createUser({ username: `${prefix}-${freshCounter}`, role: "CASHIER" });
  return buildAuthUser(u);
}

describe("expenses & expense categories (Phase 6)", () => {
  let manager: Awaited<ReturnType<typeof buildAuthUser>>;
  let accountant: Awaited<ReturnType<typeof buildAuthUser>>;
  let cashier: Awaited<ReturnType<typeof buildAuthUser>>;
  let categoryId: string;

  beforeAll(async () => {
    await resetDb();
    manager = await buildAuthUser(await createUser({ username: "mgr-exp", role: "MANAGER" }));
    accountant = await buildAuthUser(await createUser({ username: "acc-exp", role: "ACCOUNTANT" }));
    cashier = await buildAuthUser(await createUser({ username: "cash-exp", role: "CASHIER" }));
    const cat = await createExpenseCategory(manager, { name: "فواتير" });
    categoryId = cat.id;
  });

  it("creates and lists expense categories; enforces unique names", async () => {
    const c1 = await createExpenseCategory(manager, { name: "كهرباء" });
    const list = await listExpenseCategories(manager);
    expect(list.some((c) => c.id === c1.id)).toBe(true);

    let caught: unknown;
    try {
      await createExpenseCategory(manager, { name: "كهرباء" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("allows toggling a category active without deleting it", async () => {
    const c = await createExpenseCategory(manager, { name: "صيانة" });
    const dis = await setExpenseCategoryActive(manager, c.id, false);
    expect(dis.active).toBe(false);
    const list = await listExpenseCategories(manager);
    expect(list.some((x) => x.id === c.id && !x.active)).toBe(true);
  });

  it("validates category input server-side (VALIDATION)", async () => {
    let caught: unknown;
    try {
      await createExpenseCategory(manager, { name: "   " });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("VALIDATION");
  });

  it("blocks expense creation for a cashier (FORBIDDEN)", async () => {
    let caught: unknown;
    try {
      await createExpense(cashier, {
        categoryId,
        amount: 50,
        paymentMethod: "CASH",
        idempotencyKey: (crypto.randomUUID() as string),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });

  it("rejects invalid amount and unknown category (VALIDATION / NOT_FOUND)", async () => {
    let caught: unknown;
    try {
      await createExpense(manager, {
        categoryId,
        amount: 0,
        paymentMethod: "CASH",
        idempotencyKey: (crypto.randomUUID() as string),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("VALIDATION");

    let caught2: unknown;
    try {
      await createExpense(manager, {
        categoryId: new mongoose.Types.ObjectId().toString(),
        amount: 50,
        paymentMethod: "CASH",
        idempotencyKey: (crypto.randomUUID() as string),
      });
    } catch (error) {
      caught2 = error;
    }
    expect(caught2).toBeInstanceOf(AppError);
    if (caught2 instanceof AppError) expect(caught2.code).toBe("NOT_FOUND");
  });

  it("cash expense on an open shift records an EXPENSE movement and reduces expected cash", async () => {
    const shiftCashier = await freshCashier("shift-a");
    const shift = await openShift(shiftCashier, { openingCash: 500 });
    const before = await computeExpectedCash(shift.id);

    const exp = await createExpense(manager, {
      categoryId,
      amount: 120,
      paymentMethod: "CASH",
      shiftId: shift.id,
      idempotencyKey: (crypto.randomUUID() as string),
    });
    expect(exp.expenseNumber).toMatch(/^EXP-\d{8}-\d{4}$/);

    const movements = await CashMovementModel.find({ shift: shift.id, type: "EXPENSE" }).lean();
    expect(movements.some((m) => m.amount === 120)).toBe(true);

    const after = await computeExpectedCash(shift.id);
    expect(after).toBe(before - 120);
  });

  it("is idempotent: reusing the key returns the same expense without a second movement", async () => {
    const shiftCashier = await freshCashier("shift-b");
    const shift = await openShift(shiftCashier, { openingCash: 300 });
    const key = crypto.randomUUID() as string;

    const first = await createExpense(manager, {
      categoryId,
      amount: 60,
      paymentMethod: "CASH",
      shiftId: shift.id,
      idempotencyKey: key,
    });
    const second = await createExpense(manager, {
      categoryId,
      amount: 60,
      paymentMethod: "CASH",
      shiftId: shift.id,
      idempotencyKey: key,
    });
    expect(second.id).toBe(first.id);

    const count = await ExpenseModel.countDocuments({ idempotencyKey: key });
    expect(count).toBe(1);
    const movements = await CashMovementModel.find({ shift: shift.id, type: "EXPENSE" }).lean();
    expect(movements.filter((m) => m.amount === 60).length).toBe(1);
  });

  it("non-cash expense linked to an open shift does not create a cash movement", async () => {
    const shiftCashier = await freshCashier("shift-c");
    const shift = await openShift(shiftCashier, { openingCash: 100 });
    const movementsBefore = await CashMovementModel.countDocuments({ shift: shift.id, type: "EXPENSE" });

    await createExpense(manager, {
      categoryId,
      amount: 200,
      paymentMethod: "VISA",
      shiftId: shift.id,
      idempotencyKey: (crypto.randomUUID() as string),
    });

    const movementsAfter = await CashMovementModel.countDocuments({ shift: shift.id, type: "EXPENSE" });
    expect(movementsAfter).toBe(movementsBefore);
    const expected = await computeExpectedCash(shift.id);
    expect(expected).toBe(100); // no cash effect
  });

  it("accountant can create and list expenses (granted expenses.create)", async () => {
    const exp = await createExpense(accountant, {
      categoryId,
      amount: 30,
      paymentMethod: "CASH",
      idempotencyKey: (crypto.randomUUID() as string),
    });
    const list = await listExpenses(accountant, {});
    expect(list.items.some((e) => e.id === exp.id)).toBe(true);
  });

  it("lists expenses with filters and pagination", async () => {
    await createExpense(accountant, {
      categoryId,
      amount: 10,
      paymentMethod: "VODAFONE_CASH",
      idempotencyKey: (crypto.randomUUID() as string),
    });
    const page1 = await listExpenses(manager, { page: 1, pageSize: 1 });
    expect(page1.items.length).toBe(1);
    expect(page1.total).toBeGreaterThanOrEqual(2);
    const byCategory = await listExpenses(manager, { categoryId });
    expect(byCategory.items.length).toBeGreaterThanOrEqual(2);
  });
});
