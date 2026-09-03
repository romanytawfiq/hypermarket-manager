import mongoose, { type Model } from "mongoose";

/**
 * Atomic counter for concurrency-safe sequential numbering.
 *
 * Used for invoice numbers (and any future sequential identifiers). A single
 * MongoDB `findOneAndUpdate({ _id: key }, { $inc: { value: 1 } }, { upsert })`
 * is atomic, so two concurrent sales can never receive the same number
 * (REQ / architecture §9 concurrency; "no duplicate invoice numbers").
 */
export interface Sequence {
  /** The sequence identity (e.g. "sale", "sale-2026-08-31"). */
  _id: string;
  /** Current counter value. */
  value: number;
}

export type SequenceDocument = Sequence & { _id: string };

const sequenceSchema = new mongoose.Schema<Sequence>(
  {
    _id: { type: String, required: true },
    value: { type: Number, default: 0 },
  },
  { versionKey: false },
);

export const SequenceModel: Model<Sequence> =
  (mongoose.models.Sequence as Model<Sequence> | undefined) ??
  mongoose.model<Sequence>("Sequence", sequenceSchema);

/**
 * Atomically increments `key` and returns the new sequence value.
 *
 * `findOneAndUpdate` with `$inc` + `upsert` is a single atomic operation, so it
 * is safe under concurrency: concurrent calls with the same key each receive a
 * distinct, monotonically increasing value. `session` should be provided when
 * the numbering happens inside a larger transaction.
 */
export async function nextSequenceValue(
  key: string,
  session?: mongoose.ClientSession,
): Promise<number> {
  const doc = await SequenceModel.findOneAndUpdate(
    { _id: key },
    { $inc: { value: 1 } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true, session },
  )
    .lean<Sequence>()
    .exec();
  return doc?.value ?? 1;
}

/**
 * Compact `YYYYMMDD` day key used to scope per-day document counters.
 *
 * Every day-keyed business-number helper (sales invoices, café order numbers,
 * customer-payment numbers, expenses, online orders) derives the year/month/day
 * string identically; this keeps that derivation in one place.
 */
export function dayKey(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}` +
    `${String(date.getMonth() + 1).padStart(2, "0")}` +
    `${String(date.getDate()).padStart(2, "0")}`
  );
}

/**
 * Generates a day-keyed, zero-padded sequential document number.
 *
 * Combined the identical `dayKey` + atomic `nextSequenceValue` + zero-padded
 * `PREFIX-YYYYMMDD-NNNN` derivation that was copy-pasted across sales, café,
 * customer-payment, expense, and online-order numbering. Runs inside the
 * caller's transaction via `session` so the number allocation and the financial
 * write commit atomically.
 */
export async function dayKeyedNumber(
  prefix: string,
  sequenceKey: string,
  session?: mongoose.ClientSession,
  date: Date = new Date(),
): Promise<string> {
  const key = dayKey(date);
  const seq = await nextSequenceValue(`${sequenceKey}-${key}`, session);
  return `${prefix}-${key}-${String(seq).padStart(4, "0")}`;
}
