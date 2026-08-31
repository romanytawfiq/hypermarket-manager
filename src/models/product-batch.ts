import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Product batch / lot for expiry-tracked products.
 *
 * A batch holds a quantity and an expiry date. Only batches whose expiry date
 * is in the future contribute to sellable inventory (BR-024). FEFO selection,
 * when later phases allocate stock for sales, orders batches by ascending
 * expiry date (BR-025).
 */
export interface ProductBatch {
  product: mongoose.Types.ObjectId;
  /** Optional human-readable batch/lot identifier. */
  batchCode?: string;
  /** Remaining (un-consumed) quantity in this batch. */
  quantity: number;
  /** Expiry date; batches past this date are not sellable. */
  expiryDate: Date;
  /** Optional reference to the future receiving document that created it. */
  sourceReference?: {
    type?: string;
    id?: string;
  };
}

export type ProductBatchDocument = ProductBatch &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const productBatchSchema = new mongoose.Schema<ProductBatch>(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    batchCode: { type: String, default: "" },
    quantity: { type: Number, default: 0, min: 0 },
    expiryDate: { type: Date, required: true },
    sourceReference: {
      type: {
        type: String,
      },
      id: { type: String },
    },
  },
  { timestamps: true },
);

// Expiry-awareness / FEFO queries: batches per product ordered by expiry.
productBatchSchema.index({ product: 1, expiryDate: 1, quantity: 1 });

export const ProductBatchModel: Model<ProductBatch> =
  (mongoose.models.ProductBatch as Model<ProductBatch> | undefined) ??
  mongoose.model<ProductBatch>("ProductBatch", productBatchSchema);
