import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Product category. Categories group products for browsing, filtering, and
 * reporting. Categories are deactivated rather than deleted to avoid orphaning
 * products that still reference them.
 */
export interface Category {
  /** Unique category name, e.g. "مشروبات". */
  name: string;
  /** Whether the category is currently selectable for new products. */
  active: boolean;
  /**
   * Whether products in this category support café sugar customization.
   * The café order builder derives a product's sugar capability from its
   * category configuration, so this is the single source of truth (not a
   * per-product boolean). Historical café orders snapshot their own sugar
   * levels and are never rewritten when this setting changes.
   */
  supportsSugarOptions: boolean;
}

export type CategoryDocument = Category &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const categorySchema = new mongoose.Schema<Category>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    active: { type: Boolean, default: true },
    supportsSugarOptions: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const CategoryModel: Model<Category> =
  (mongoose.models.Category as Model<Category> | undefined) ??
  mongoose.model<Category>("Category", categorySchema);
