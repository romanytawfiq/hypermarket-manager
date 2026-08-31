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
