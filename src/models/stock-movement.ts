import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Append-only stock movement record.
 *
 * This is the authoritative history of inventory changes. Quantities are signed
 * deltas: positive increases sellable stock, negative decreases it. Records are
 * never mutated or deleted; corrections are represented by new movements.
 *
 * The movement-type union is defined up front so future domains (purchases,
 * sales, transfers) can reuse it. Only ADJUSTMENT, STOCK_COUNT, DAMAGE, and
 * EXPIRY can originate in Phase 2; the others are reserved for later phases.
 */
export const STOCK_MOVEMENT_TYPES = [
  "PURCHASE",
  "SALE",
  "CUSTOMER_RETURN",
  "SUPPLIER_RETURN",
  "DAMAGE",
  "EXPIRY",
  "ADJUSTMENT",
  "STOCK_COUNT",
  "TRANSFER",
] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export interface StockMovement {
  product: mongoose.Types.ObjectId;
  type: StockMovementType;
  /** Signed quantity delta (positive in / negative out). */
  quantity: number;
  /** Optional ProductBatch reference when movement targets a batch. */
  batch?: mongoose.Types.ObjectId;
  /** Optional snapshot label of the batch (readability for history). */
  batchCode?: string;
  /** Business reason / note describing why the change occurred. */
  reason: string;
  /** Optional reference to a future origin document (purchase / sale / ...). */
  referenceType?: string;
  referenceId?: string;
  /** Acting user (snapshot id + username for readable history). */
  actorId?: string;
  actorUsername?: string;
}

export type StockMovementDocument = StockMovement &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const stockMovementSchema = new mongoose.Schema<StockMovement>(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    type: { type: String, enum: STOCK_MOVEMENT_TYPES, required: true },
    quantity: { type: Number, required: true },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductBatch",
      default: null,
    },
    batchCode: { type: String, default: "" },
    reason: { type: String, default: "" },
    referenceType: { type: String },
    referenceId: { type: String },
    actorId: { type: String },
    actorUsername: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Operational queries: movements per product, and by type/time.
stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1, createdAt: -1 });

export const StockMovementModel: Model<StockMovement> =
  (mongoose.models.StockMovement as Model<StockMovement> | undefined) ??
  mongoose.model<StockMovement>("StockMovement", stockMovementSchema);
