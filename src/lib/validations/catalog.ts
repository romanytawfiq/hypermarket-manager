import { z } from "zod";

/**
 * Shared client/server validation for the catalog domain (products, categories,
 * brands). Server Actions re-validate everything server-side; client use is UX.
 *
 * No negative prices or minimum stock; equality/gt checks are enforced by
 * transforms + refinements so users get clear Arabic messages.
 */

export const categorySchema = z.object({
  name: z.string().trim().min(1, "أدخل اسم الفئة").max(120, "اسم الفئة طويل جدًا"),
  active: z.boolean().optional(),
  /** Category-level café sugar capability: products in this category offer a structured sugar picker. */
  supportsSugarOptions: z.boolean().optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export const brandSchema = z.object({
  name: z.string().trim().min(1, "أدخل اسم العلامة التجارية").max(120, "الاسم طويل جدًا"),
  active: z.boolean().optional(),
  /** Brand logo as a data-URI image (optional). Validated for a supported raster
   *  mime type and a capped decoded size to avoid abusing the document. */
  logo: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => {
        if (!v) return true;
        if (!v.startsWith("data:image/")) return false;
        const semicolon = v.indexOf(";");
        const mime = semicolon > -1 ? v.slice(5, semicolon) : "";
        return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime);
      },
      "صيغة صورة الشعار غير مدعومة. استخدم PNG أو JPG أو WEBP أو GIF",
    )
    .refine(
      (v) => {
        if (!v) return true;
        const size = estimateDataUriBytes(v);
        return size <= 512 * 1024; // 512 KB decoded
      },
      "حجم صورة الشعار كبير جدًا. اختر صورة أصغر من 512 ك.ب",
    ),
});

/** Approximates decoded size (bytes) of a base64 data-URI body. */
function estimateDataUriBytes(uri: string): number {
  const comma = uri.indexOf(",");
  if (comma === -1) return uri.length;
  const base64 = uri.slice(comma + 1);
  // base64 length * 3/4 ≈ decoded bytes (ignores padding).
  return Math.floor((base64.length * 3) / 4);
}

export type BrandInput = z.infer<typeof brandSchema>;

const optionalIdentifier = z
  .string()
  .trim()
  .optional()
  .refine((v) => v === undefined || v === "" || v.length >= 2, {
    message: "الرمز قصير جدًا",
  });

export const productCreateSchema = z.object({
  name: z.string().trim().min(1, "أدخل اسم المنتج").max(200, "اسم المنتج طويل جدًا"),
  barcode: z.union([optionalIdentifier, z.literal("")]).optional(),
  sku: z.union([optionalIdentifier, z.literal("")]).optional(),
  categoryId: z.string().min(1, "اختر الفئة"),
  brandId: z.union([z.string().min(1, "اختر العلامة التجارية"), z.literal("")]).optional(),
  unit: z.string().trim().min(1, "أدخل الوحدة").max(40, "الوحدة طويلة جدًا"),
  purchaseCost: z.coerce.number().min(0, "تكلفة الشراء يجب ألا تكون سالبة"),
  sellingPrice: z.coerce.number().min(0, "سعر البيع يجب ألا يكون سالبًا"),
  minimumStock: z.coerce.number().int().min(0, "الحد الأدنى يجب ألا يكون سالبًا"),
  trackExpiry: z.boolean().optional(),
  onlineVisible: z.boolean().optional(),
  description: z.string().trim().max(2000, "الوصف طويل جدًا").optional(),
  active: z.boolean().optional(),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "أدخل اسم المنتج").max(200, "اسم المنتج طويل جدًا").optional(),
    barcode: z.union([optionalIdentifier, z.literal("")]).optional(),
    sku: z.union([optionalIdentifier, z.literal("")]).optional(),
    categoryId: z.string().min(1, "اختر الفئة").optional(),
    brandId: z.union([z.string().min(1), z.literal("")]).optional(),
    unit: z.string().trim().min(1, "أدخل الوحدة").max(40).optional(),
    purchaseCost: z.coerce.number().min(0, "تكلفة الشراء يجب ألا تكون سالبة").optional(),
    sellingPrice: z.coerce.number().min(0, "سعر البيع يجب ألا يكون سالبًا").optional(),
    minimumStock: z.coerce.number().int().min(0).optional(),
    trackExpiry: z.boolean().optional(),
    onlineVisible: z.boolean().optional(),
    description: z.string().trim().max(2000).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "لا توجد تغييرات لإرسالها",
  });

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/** Server-side product list/search filters. */
export const productQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  status: z.enum(["active", "inactive", "all"]).optional().default("active"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;
