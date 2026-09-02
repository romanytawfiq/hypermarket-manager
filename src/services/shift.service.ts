import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { dbConnect, withTransaction } from "@/lib/db";
import { requirePermission } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { recordAudit } from "@/services/audit.service";
import { CashierShiftModel, type ShiftStatus } from "@/models/cashier-shift";
import { CashMovementModel, type CashMovementType } from "@/models/cash-movement";
import { SaleModel, type Payment } from "@/models/sale";
import { isCashMethod } from "@/lib/sales/constants";
import type {
  ShiftOpenInput,
  ShiftCloseInput,
  CashMovementInput,
} from "@/lib/validations/sales";

/**
 * Cashier shift core (Phase 4).
 *
 * One shift per cashier (enforced server-side at open). Expected cash at
 * closing is derived from recorded transactions only (BR-037):
 *
 *   expectedCash = openingCash
 *                + cash payments from this shift's sales
 *                + CASH_IN movements
 *                - CASH_OUT movements
 *                - EXPENSE movements
 *
 * Variance = actualCash - expectedCash (BR-039), preserved historically. A
 * finalized shift is never overwritten (BR-002).
 */

/** |variance| above this value flags a shift for manager review. Configurable constant. */
export const SHIFT_REVIEW_THRESHOLD = 50;

export interface ShiftDto {
  id: string;
  cashierId: string;
  cashierUsername: string;
  openingCash: number;
  openedAt: string;
  status: ShiftStatus;
  expectedCash: number | null;
  actualCash: number | null;
  variance: number | null;
  closedAt: string | null;
  closingNote: string;
  salesCount: number;
  cashSales: number;
}

/** Cross-user management access: OWNER and MANAGER may act on any shift. */
function canManageOtherShift(actor: AuthUser): boolean {
  return actor.isOwner || actor.role === "MANAGER";
}

/** Builds a DTO, including derived cash totals for the shift. */
async function toShiftDto(shift: {
  _id: mongoose.Types.ObjectId;
  cashierId: mongoose.Types.ObjectId;
  cashierUsername: string;
  openingCash: number;
  openedAt: Date;
  status: ShiftStatus;
  expectedCash?: number;
  actualCash?: number;
  variance?: number;
  closedAt?: Date;
  closingNote?: string;
}): Promise<ShiftDto> {
  const sid = shift._id.toString();
  const stat = await shiftTotals(sid);
  return {
    id: sid,
    cashierId: shift.cashierId.toString(),
    cashierUsername: shift.cashierUsername,
    openingCash: shift.openingCash,
    openedAt: shift.openedAt.toISOString(),
    status: shift.status,
    expectedCash: shift.expectedCash ?? null,
    actualCash: shift.actualCash ?? null,
    variance: shift.variance ?? null,
    closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
    closingNote: shift.closingNote ?? "",
    salesCount: stat.count,
    cashSales: stat.cash,
  };
}

/** Cash payments + sale count for a shift. */
async function shiftTotals(shiftId: string): Promise<{ count: number; cash: number }> {
  const rows = await SaleModel.find({ shift: shiftId })
    .select("payments totalAmount")
    .lean<Array<{ payments: Payment[] }>>();
  let cash = 0;
  for (const r of rows) {
    for (const p of r.payments) {
      if (isCashMethod(p.method)) cash += p.amount;
    }
  }
  return { count: rows.length, cash };
}

/** Net cash-movement totals for the shift (CASH_IN - CASH_OUT - EXPENSE). */
async function cashMovementsTotals(shiftId: string): Promise<number> {
  const rows = await CashMovementModel.find({ shift: shiftId })
    .select("type amount")
    .lean<Array<{ type: CashMovementType; amount: number }>>();
  let net = 0;
  for (const r of rows) {
    if (r.type === "CASH_IN") net += r.amount;
    else if (r.type === "CASH_OUT" || r.type === "EXPENSE") net -= r.amount;
    // ADJUSTMENT not part of the standard reconciliation formula.
  }
  return net;
}

/** Computes the expected closing cash for a shift from recorded data (BR-037). */
export async function computeExpectedCash(shiftId: string): Promise<number> {
  await dbConnect();
  const shift = await CashierShiftModel.findById(shiftId)
    .select("openingCash")
    .lean<{ openingCash: number }>();
  if (!shift) throw new AppError("NOT_FOUND", "الوردية غير موجودة");
  const [totals, movements] = await Promise.all([shiftTotals(shiftId), cashMovementsTotals(shiftId)]);
  return Math.round((shift.openingCash + totals.cash + movements) * 100) / 100;
}

/** Returns the cashier's active (OPEN) shift, or null. */
async function findActiveShift(cashierId: string): Promise<{ _id: mongoose.Types.ObjectId } | null> {
  return CashierShiftModel.findOne({ cashierId, status: "OPEN" })
    .select("_id")
    .sort({ openedAt: -1 })
    .lean<{ _id: mongoose.Types.ObjectId }>();
}

/** Opens a shift for the current cashier. Requires `shifts.open`. */
export async function openShift(actor: AuthUser | null, input: ShiftOpenInput): Promise<ShiftDto> {
  const authed = requirePermission(actor, "shifts.open");
  await dbConnect();

  // Enforce one active shift per cashier server-side (BR / architecture §9).
  const existing = await findActiveShift(authed.id);
  if (existing) {
    throw new AppError("CONFLICT", "توجد وردية مفتوحة بالفعل. أغلقها قبل فتح وردية جديدة");
  }

  const shift = await CashierShiftModel.create({
    cashierId: authed.id,
    cashierUsername: authed.username,
    openingCash: Math.round(input.openingCash * 100) / 100,
    openedAt: new Date(),
    status: "OPEN",
  });
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "shift.opened",
    entity: "shift",
    entityId: shift._id.toString(),
    after: { openingCash: shift.openingCash },
  });
  return toShiftDto(shift);
}

/** Returns the active shift for the current cashier, or null. Requires `shifts.read`. */
export async function getActiveShift(
  actor: AuthUser | null,
): Promise<ShiftDto | null> {
  requirePermission(actor, "shifts.read");
  await dbConnect();
  const found = await findActiveShift(actor!.id);
  if (!found) return null;
  const shift = await CashierShiftModel.findById(found._id).lean();
  if (!shift) return null;
  return toShiftDto(shift);
}

/** Lists shifts; own shifts for any role, all shifts for OWNER/MANAGER. Requires `shifts.read`. */
export async function listShifts(actor: AuthUser | null): Promise<ShiftDto[]> {
  const authed = requirePermission(actor, "shifts.read");
  await dbConnect();
  const filter = canManageOtherShift(authed) ? {} : { cashierId: authed.id };
  const shifts = await CashierShiftModel.find(filter)
    .sort({ openedAt: -1 })
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        cashierId: mongoose.Types.ObjectId;
        cashierUsername: string;
        openingCash: number;
        openedAt: Date;
        status: ShiftStatus;
        expectedCash?: number;
        actualCash?: number;
        variance?: number;
        closedAt?: Date;
        closingNote?: string;
      }>
    >();
  return Promise.all(shifts.map((s) => toShiftDto(s)));
}

/**
 * Closes a shift: computes expected cash, variance, and final status server-side.
 * Requires `shifts.close`; a cashier may close only their own shift.
 */
export async function closeShift(actor: AuthUser | null, shiftId: string, input: ShiftCloseInput): Promise<ShiftDto> {
  const authed = requirePermission(actor, "shifts.close");
  await dbConnect();

  const shift = await CashierShiftModel.findById(shiftId);
  if (!shift) throw new AppError("NOT_FOUND", "الوردية غير موجودة");
  if (!canManageOtherShift(authed) && shift.cashierId.toString() !== authed.id) {
    throw new AppError("FORBIDDEN", "لا يمكنك إغلاق وردية كاشير آخر");
  }
  if (shift.status !== "OPEN") {
    throw new AppError("CONFLICT", "هذه الوردية مغلقة بالفعل أو غير قابلة للإغلاق");
  }

  const expectedCash = await computeExpectedCash(shiftId);
  const actualCash = Math.round(input.actualCash * 100) / 100;
  const variance = Math.round((actualCash - expectedCash) * 100) / 100;
  const status: ShiftStatus = Math.abs(variance) > SHIFT_REVIEW_THRESHOLD ? "REVIEW_REQUIRED" : "CLOSED";

  return withTransaction(async (session) => {
    const res = await CashierShiftModel.updateOne(
      { _id: shift._id, status: "OPEN" },
      {
        $set: {
          status,
          expectedCash,
          actualCash,
          variance,
          closedAt: new Date(),
          closedBy: { id: authed.id, username: authed.username },
          closingNote: input.note ?? "",
        },
      },
      { session },
    );
    if (res.matchedCount === 0) {
      throw new AppError("CONFLICT", "تعذّر إغلاق الوردية لأن حالتها تغيّرت");
    }

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "shift.closed",
      entity: "shift",
      entityId: shiftId,
      before: { status: "OPEN" },
      after: { status, expectedCash, actualCash, variance },
    });

    const updated = await CashierShiftModel.findById(shiftId).session(session).lean();
    if (!updated) throw new AppError("NOT_FOUND", "الوردية غير موجودة");
    return toShiftDto(updated);
  });
}

/** Records an approved cash movement for an open shift. Requires `cash_movements.create`. */
export async function recordCashMovement(
  actor: AuthUser | null,
  shiftId: string,
  input: CashMovementInput,
): Promise<{ id: string; type: CashMovementType; amount: number; reason: string }> {
  const authed = requirePermission(actor, "cash_movements.create");
  await dbConnect();
  const shift = await CashierShiftModel.findById(shiftId);
  if (!shift) throw new AppError("NOT_FOUND", "الوردية غير موجودة");
  if (!canManageOtherShift(authed) && shift.cashierId.toString() !== authed.id) {
    throw new AppError("FORBIDDEN", "لا يمكنك تعديل وردية كاشير آخر");
  }
  if (shift.status !== "OPEN") {
    throw new AppError("CONFLICT", "لا يمكن تسجيل حركة نقد في وردية مغلقة");
  }
  const doc = await CashMovementModel.create({
    shift: shift._id,
    type: input.type,
    amount: input.amount,
    reason: input.reason,
    createdBy: { id: authed.id, username: authed.username },
  });
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: `cash_movement.${input.type.toLowerCase()}`,
    entity: "cash_movement",
    entityId: doc._id.toString(),
    after: { shiftId, type: input.type, amount: input.amount, reason: input.reason },
  });
  return { id: doc._id.toString(), type: doc.type, amount: doc.amount, reason: doc.reason };
}

/**
 * Lists cash movements for a shift. Requires `cash_movements.read`.
 * Authorization mirrors the write paths (listShifts/closeShift): an OWNER/MANAGER
 * may read any shift's movements, while every other role (e.g. a CASHIER holding
 * `cash_movements.read`) is scoped to their own shift, preventing enumeration of
 * another cashier's movement records via an arbitrary `shiftId` (IDOR-lite).
 */
export async function listCashMovements(
  actor: AuthUser | null,
  shiftId: string,
): Promise<Array<{ id: string; type: CashMovementType; amount: number; reason: string; createdAt: string }>> {
  const authed = requirePermission(actor, "cash_movements.read");
  await dbConnect();

  const shift = await CashierShiftModel.findById(shiftId).lean<{ _id: mongoose.Types.ObjectId; cashierId: mongoose.Types.ObjectId }>();
  if (!shift) throw new AppError("NOT_FOUND", "الوردية غير موجودة");
  if (!canManageOtherShift(authed) && shift.cashierId.toString() !== authed.id) {
    throw new AppError("FORBIDDEN", "لا يمكنك الاطلاع على حركات وردية كاشير آخر");
  }

  const rows = await CashMovementModel.find({ shift: shift._id })
    .sort({ createdAt: -1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; type: CashMovementType; amount: number; reason: string; createdAt?: Date }>>();
  return rows.map((r) => ({
    id: r._id.toString(),
    type: r.type,
    amount: r.amount,
    reason: r.reason,
    createdAt: r.createdAt?.toISOString() ?? "",
  }));
}

/** Arabic label for a cash movement type. */
export function cashMovementTypeLabel(t: CashMovementType): string {
  return (
    {
      CASH_IN: "إيداع نقدي",
      CASH_OUT: "سحب نقدي",
      EXPENSE: "مصروف نقدي",
      ADJUSTMENT: "تسوية نقدية",
    } as Record<CashMovementType, string>
  )[t];
}
