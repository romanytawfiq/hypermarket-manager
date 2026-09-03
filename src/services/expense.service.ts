import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { dbConnect, withTransaction } from "@/lib/db";
import { requirePermission } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { recordAudit } from "@/services/audit.service";
import { ExpenseModel } from "@/models/expense";
import { ExpenseCategoryModel } from "@/models/expense-category";
import { CashierShiftModel } from "@/models/cashier-shift";
import { CashMovementModel } from "@/models/cash-movement";
import { dayKeyedNumber } from "@/models/sequence";
import { paymentMethodLabel, isCashMethod, type PaymentMethod } from "@/lib/sales/constants";
import { parseOrThrow } from "@/lib/validations/shared";
import type {
  ExpenseInput,
  ExpenseCategoryInput,
} from "@/lib/validations/expenses";
import {
  expenseSchema,
  expenseCategorySchema,
} from "@/lib/validations/expenses";

/**
 * Expense core (Phase 6).
 *
 * Expenses are persisted financial transactions. A cash expense linked to an
 * OPEN shift also produces an EXPENSE cash movement so shift reconciliation
 * (expected cash) accounts for it. Recording is idempotent (unique
 * `idempotencyKey`) and transactional so the expense + movement commit or roll
 * back together. The server is authoritative for amounts and references.
 */

export interface ExpenseCategoryDto {
  id: string;
  name: string;
  active: boolean;
}

export interface ExpenseDto {
  id: string;
  expenseNumber: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  expenseDate: string;
  shiftId: string | null;
  notes: string;
  createdBy: string;
  createdAt: string;
}

const CATEGORY_FIELDS = "_id name active";

async function loadCategory(id: string): Promise<{ _id: mongoose.Types.ObjectId; name: string; active: boolean }> {
  const category = await ExpenseCategoryModel.findById(id).select(CATEGORY_FIELDS).lean<{
    _id: mongoose.Types.ObjectId;
    name: string;
    active: boolean;
  }>();
  if (!category) throw new AppError("NOT_FOUND", "فئة المصروف غير موجودة");
  return category;
}

function toCategoryDto(c: { _id: mongoose.Types.ObjectId; name: string; active: boolean }): ExpenseCategoryDto {
  return { id: c._id.toString(), name: c.name, active: c.active ?? true };
}

function toExpenseDto(
  e: {
    _id: mongoose.Types.ObjectId;
    expenseNumber: string;
    category: mongoose.Types.ObjectId;
    amount: number;
    paymentMethod: PaymentMethod;
    expenseDate?: Date;
    shift?: mongoose.Types.ObjectId | null;
    notes?: string;
    createdBy?: { id?: string; username?: string };
    createdAt?: Date;
  },
  categoryName: string,
): ExpenseDto {
  return {
    id: e._id.toString(),
    expenseNumber: e.expenseNumber,
    categoryId: e.category.toString(),
    categoryName,
    amount: e.amount,
    paymentMethod: e.paymentMethod,
    expenseDate: e.expenseDate?.toISOString() ?? "",
    shiftId: e.shift ? e.shift.toString() : null,
    notes: e.notes ?? "",
    createdBy: e.createdBy?.username ?? "",
    createdAt: e.createdAt?.toISOString() ?? "",
  };
}

async function categoryName(id: string): Promise<string> {
  const c = await loadCategory(id);
  return c.name;
}
/* ---- Expense categories ---- */

export async function listExpenseCategories(
  actor: AuthUser | null,
  opts: { activeOnly?: boolean } = {},
): Promise<ExpenseCategoryDto[]> {
  requirePermission(actor, "expense_categories.read");
  await dbConnect();
  const filter = opts.activeOnly ? { active: true } : {};
  const rows = await ExpenseCategoryModel.find(filter)
    .sort({ name: 1 })
    .select(CATEGORY_FIELDS)
    .lean<Array<{ _id: mongoose.Types.ObjectId; name: string; active: boolean }>>();
  return rows.map(toCategoryDto);
}

export async function createExpenseCategory(
  actor: AuthUser | null,
  input: ExpenseCategoryInput,
): Promise<ExpenseCategoryDto> {
  const authed = requirePermission(actor, "expense_categories.manage");
  await dbConnect();
  input = parseOrThrow(expenseCategorySchema, input);

  const existing = await ExpenseCategoryModel.findOne({ name: input.name.trim() }).select("_id").lean();
  if (existing) throw new AppError("CONFLICT", "توجد فئة بهذا الاسم بالفعل");

  const doc = await ExpenseCategoryModel.create({
    name: input.name.trim(),
    active: input.active ?? true,
    createdBy: { id: authed.id, username: authed.username },
  });
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "expense_category.created",
    entity: "expense_category",
    entityId: doc._id.toString(),
    after: { name: doc.name },
  });
  return toCategoryDto(doc);
}

export async function updateExpenseCategory(
  actor: AuthUser | null,
  id: string,
  input: ExpenseCategoryInput,
): Promise<ExpenseCategoryDto> {
  const authed = requirePermission(actor, "expense_categories.manage");
  await dbConnect();
  input = parseOrThrow(expenseCategorySchema, input);
  const doc = await ExpenseCategoryModel.findById(id);
  if (!doc) throw new AppError("NOT_FOUND", "فئة المصروف غير موجودة");

  const before = { name: doc.name, active: doc.active };
  if (input.name !== undefined && input.name.trim() !== doc.name) {
    const existing = await ExpenseCategoryModel.findOne({ name: input.name.trim() }).select("_id").lean();
    if (existing && existing._id.toString() !== id) {
      throw new AppError("CONFLICT", "توجد فئة بهذا الاسم بالفعل");
    }
    doc.name = input.name.trim();
  }
  if (input.active !== undefined) doc.active = input.active;
  await doc.save();

  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "expense_category.updated",
    entity: "expense_category",
    entityId: id,
    before,
    after: { name: doc.name, active: doc.active },
  });
  return toCategoryDto(doc);
}

export async function setExpenseCategoryActive(
  actor: AuthUser | null,
  id: string,
  active: boolean,
): Promise<ExpenseCategoryDto> {
  const authed = requirePermission(actor, "expense_categories.manage");
  await dbConnect();
  const doc = await ExpenseCategoryModel.findById(id);
  if (!doc) throw new AppError("NOT_FOUND", "فئة المصروف غير موجودة");
  doc.active = active;
  await doc.save();
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: active ? "expense_category.activated" : "expense_category.disabled",
    entity: "expense_category",
    entityId: id,
    after: { active },
  });
  return toCategoryDto(doc);
}

/**
 * Creates an expense. Requires `expenses.create`.
 *
 * When paid in cash against an OPEN shift, an EXPENSE cash movement is also
 * recorded (transactionally) so the shift's expected-cash formula counts it.
 * A closed shift is never mutated; if the linked shift is not open the expense
 * is still filed without a movement (historical cash-flow reads come from the
 * Expense document itself).
 */
export async function createExpense(
  actor: AuthUser | null,
  input: ExpenseInput,
): Promise<{ id: string; expenseNumber: string; amount: number }> {
  const authed = requirePermission(actor, "expenses.create");
  await dbConnect();
  input = parseOrThrow(expenseSchema, input);

  return withTransaction(async (session) => {
    // Idempotency: replaying the same key returns the existing expense.
    if (input.idempotencyKey) {
      const existing = await ExpenseModel.findOne({ idempotencyKey: input.idempotencyKey })
        .session(session)
        .select("_id expenseNumber amount")
        .lean();
      if (existing) {
        return {
          id: existing._id.toString(),
          expenseNumber: existing.expenseNumber,
          amount: existing.amount,
        };
      }
    }

    const category = await loadCategory(input.categoryId);
    if (!category.active) {
      throw new AppError("CONFLICT", "فئة المصروف غير نشطة");
    }

    const amount = Math.round(input.amount * 100) / 100;
    const expenseDate = input.expenseDate ? new Date(input.expenseDate) : new Date();
    if (Number.isNaN(expenseDate.getTime())) {
      throw new AppError("VALIDATION", "التاريخ غير صحيح");
    }

    // Shift linkage: resolve + authorize when provided.
    let shiftId: mongoose.Types.ObjectId | null = null;
    let shiftOpen = false;
    if (input.shiftId) {
      const shift = await CashierShiftModel.findById(input.shiftId)
        .session(session)
        .select("cashierId status")
        .lean();
      if (!shift) throw new AppError("NOT_FOUND", "الوردية غير موجودة");
      const ownsShift =
        shift.cashierId.toString() === authed.id || authed.isOwner || authed.role === "MANAGER";
      if (!ownsShift) throw new AppError("FORBIDDEN", "لا يمكنك ربط مصروف بوردية كاشير آخر");
      shiftId = shift._id;
      shiftOpen = shift.status === "OPEN";
    }

    const now = new Date();
    const expenseNumber = await dayKeyedNumber("EXP", "expense", session, now);

    const [expense] = await ExpenseModel.create(
      [
        {
          expenseNumber,
          category: category._id,
          amount,
          paymentMethod: input.paymentMethod,
          expenseDate,
          shift: shiftId ?? undefined,
          notes: input.notes ?? "",
          createdBy: { id: authed.id, username: authed.username },
          idempotencyKey: input.idempotencyKey,
        },
      ],
      { session },
    );
    if (!expense) throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء تسجيل المصروف");

    // Cash paid against an OPEN shift -> reconcile it via an EXPENSE movement.
    if (isCashMethod(input.paymentMethod) && shiftId && shiftOpen) {
      await CashMovementModel.create(
        [
          {
            shift: shiftId,
            type: "EXPENSE",
            amount,
            reason: `مصروف ${category.name} (${expenseNumber})`,
            createdBy: { id: authed.id, username: authed.username },
          },
        ],
        { session },
      );
    }

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "expense.created",
      entity: "expense",
      entityId: expense._id.toString(),
      after: {
        expenseNumber,
        category: category.name,
        amount,
        paymentMethod: input.paymentMethod,
        expenseDate: expenseDate.toISOString(),
        shiftId: shiftId ? shiftId.toString() : null,
      },
    });

    return {
      id: expense._id.toString(),
      expenseNumber: expense.expenseNumber,
      amount: expense.amount,
    };
  });
}

/* ---- List / get ---- */

export interface ExpenseListParams {
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export async function listExpenses(
  actor: AuthUser | null,
  query: ExpenseListParams = {},
): Promise<{ items: ExpenseDto[]; total: number; page: number; pageSize: number }> {
  requirePermission(actor, "expenses.read");
  await dbConnect();

  const filter: Record<string, unknown> = {};
  if (query.dateFrom) {
    const from = new Date(query.dateFrom);
    if (!Number.isNaN(from.getTime())) filter.expenseDate = { ...(filter.expenseDate as object), $gte: from };
  }
  if (query.dateTo) {
    const to = new Date(query.dateTo);
    if (!Number.isNaN(to.getTime())) {
      const endOfDay = new Date(to);
      endOfDay.setHours(23, 59, 59, 999);
      filter.expenseDate = { ...(filter.expenseDate as object), $lte: endOfDay };
    }
  }
  if (query.categoryId) filter.category = new mongoose.Types.ObjectId(query.categoryId);

  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  const [total, rows] = await Promise.all([
    ExpenseModel.countDocuments(filter),
    ExpenseModel.find(filter)
      .sort({ expenseDate: -1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<
        Array<{
          _id: mongoose.Types.ObjectId;
          expenseNumber: string;
          category: mongoose.Types.ObjectId;
          amount: number;
          paymentMethod: PaymentMethod;
          expenseDate?: Date;
          shift?: mongoose.Types.ObjectId | null;
          notes?: string;
          createdBy?: { id?: string; username?: string };
          createdAt?: Date;
        }>
      >(),
  ]);

  const items = await Promise.all(
    rows.map(async (r) => {
      const name = await categoryName(r.category.toString());
      return toExpenseDto(r, name);
    }),
  );

  return { items, total, page, pageSize };
}

export async function getExpense(actor: AuthUser | null, id: string): Promise<ExpenseDto> {
  requirePermission(actor, "expenses.read");
  await dbConnect();
  const doc = await ExpenseModel.findById(id).lean<{
    _id: mongoose.Types.ObjectId;
    expenseNumber: string;
    category: mongoose.Types.ObjectId;
    amount: number;
    paymentMethod: PaymentMethod;
    expenseDate?: Date;
    shift?: mongoose.Types.ObjectId | null;
    notes?: string;
    createdBy?: { id?: string; username?: string };
    createdAt?: Date;
  }>();
  if (!doc) throw new AppError("NOT_FOUND", "المصروف غير موجود");
  const name = await categoryName(doc.category.toString());
  return toExpenseDto(doc, name);
}

/** Arabic label for a payment method. */
export { paymentMethodLabel };
