import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Fast current-state representation of a product's inventory.
 *
 * This is a denormalized cache; the authoritative history lives in the
 * append-only StockMovement collection. `onHand` is the currently sellable
 * quantity; `nonSellable` holds quantities removed from sellable stock (e.g.
 * damaged goods, or expired stock awaiting disposal).
 *
 * `version` supports optimistic concurrency: every mutation is a
 * `findOneAndUpdate({ product, version }, { $inc: ... , $set: { version: version+1 } })`
 * so concurrent decrements never silently overwrite each other (BR-005, §9).
 */
export interface InventoryState {
  product: mongoose.Types.ObjectId;
  /** Currently sellable quantity. */
  onHand: number;
  /** Quantity not sellable (damaged / awaiting disposal). */
  nonSellable: number;
  /** Optimistic-concurrency version counter. */
  version: number;
}

export type InventoryStateDocument = InventoryState &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const inventoryStateSchema = new mongoose.Schema<InventoryState>(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      unique: true,
      index: true,
    },
    onHand: { type: Number, default: 0, min: 0 },
    nonSellable: { type: Number, default: 0, min: 0 },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export const InventoryStateModel: Model<InventoryState> =
  (mongoose.models.InventoryState as Model<InventoryState> | undefined) ??
  mongoose.model<InventoryState>("InventoryState", inventoryStateSchema);
