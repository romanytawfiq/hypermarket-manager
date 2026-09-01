import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Product (catalog item).
 *
 * Product identity may come from a barcode, an SKU, or both. Both are unique
 * when present, but optional (sparse indexes) so products without a barcode/SKU
 * do not collide. Prices are the *current* catalog prices; historical sale and
 * purchase documents snapshot their own values so later price changes cannot
 * corrupt history (BR-006).
 */
export interface Product {
  name: string;
  /** Unique when present (sparse unique index). */
  barcode?: string;
  /** Unique when present (sparse unique index). */
  sku?: string;
  /** Reference to an active Category. */
  category: mongoose.Types.ObjectId;
  /** Optional reference to an active Brand. */
  brand?: mongoose.Types.ObjectId;
  /** Base unit of measure, e.g. "قطعة" / "كجم". */
  unit: string;
  /** Latest purchase cost (catalog value; historical purchases snapshot theirs). */
  purchaseCost: number;
  /** Current selling price. */
  sellingPrice: number;
  /** Low-stock threshold (BR-026: low when sellable stock <= minimum). */
  minimumStock: number;
  /** Whether this product requires batch / expiry tracking. */
  trackExpiry: boolean;
  /**
   * LEGACY (backward-compat only): per-product café sugar capability. No longer
   * the source of truth — sugar capability is derived from the product's
   * Category (`Category.supportsSugarOptions`). Kept so existing documents
   * round-trip unchanged; never read or written for new behavior.
   */
  supportsSugarOptions?: boolean;
  /** Whether the product may appear in the online store. */
  onlineVisible: boolean;
  description?: string;
  active: boolean;
}

export type ProductDocument = Product &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const productSchema = new mongoose.Schema<Product>(
  {
    name: { type: String, required: true, trim: true, index: true },
    barcode: {
      type: String,
      trim: true,
      index: { unique: true, sparse: true },
    },
    sku: {
      type: String,
      trim: true,
      index: { unique: true, sparse: true },
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      default: null,
      index: true,
    },
    unit: { type: String, default: "قطعة" },
    purchaseCost: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    minimumStock: { type: Number, default: 0, min: 0 },
    trackExpiry: { type: Boolean, default: false },
    /**
     * LEGACY (backward-compat only): this field was the original per-product
     * café sugar capability. It is no longer the source of truth — sugar
     * capability is now derived from the product's Category
     * (`Category.supportsSugarOptions`). The field is kept on the schema so
     * existing documents persist unchanged, but it is never read or written by
     * the application for new behavior.
     */
    supportsSugarOptions: { type: Boolean, default: false },
    onlineVisible: { type: Boolean, default: false },
    description: { type: String, default: "" },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Common operational lookup: active products by name, and by category.
productSchema.index({ active: 1, name: 1 });

export const ProductModel: Model<Product> =
  (mongoose.models.Product as Model<Product> | undefined) ??
  mongoose.model<Product>("Product", productSchema);
