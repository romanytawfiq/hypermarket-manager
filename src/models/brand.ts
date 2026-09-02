import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Product brand. Brands are optional on products and deactivated rather than
 * deleted to preserve references from existing products.
 */
export interface Brand {
  /** Unique brand name, e.g. "بيبسي". */
  name: string;
  /** Whether the brand is currently selectable for new products. */
  active: boolean;
  /** Brand logo as a data-URI image (optional). Stored inline so no external
   *  hosting/upload infra is required; validated server-side for mime + size. */
  logo?: string;
}

export type BrandDocument = Brand &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const brandSchema = new mongoose.Schema<Brand>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    active: { type: Boolean, default: true },
    logo: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

export const BrandModel: Model<Brand> =
  (mongoose.models.Brand as Model<Brand> | undefined) ??
  mongoose.model<Brand>("Brand", brandSchema);
