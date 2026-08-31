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
  },
  { timestamps: true },
);

export const CategoryModel: Model<Category> =
  (mongoose.models.Category as Model<Category> | undefined) ??
  mongoose.model<Category>("Category", categorySchema);
