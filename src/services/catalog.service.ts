import type mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { dbConnect } from "@/lib/db";
import { requirePermission } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { recordAudit } from "@/services/audit.service";
import { CategoryModel } from "@/models/category";
import { BrandModel } from "@/models/brand";
import { ProductModel } from "@/models/product";
import { createInitialInventoryState, getSellableStock } from "@/services/inventory.service";
import type {
  CategoryInput,
  BrandInput,
  ProductCreateInput,
  ProductUpdateInput,
  ProductQuery,
} from "@/lib/validations/catalog";

/**
 * Catalog core (Phase 2): categories, brands, and products.
 *
 * Products can be disabled but never physically deleted — historical documents
 * (movements, future sales) reference them, so we preserve the record (BR-004,
 * BR-022, BR-024, historical integrity). Category/Brand deactivation keeps the
 * record while preventing new selections.
 */

export interface CategoryDto {
  id: string;
  name: string;
  active: boolean;
  /** Products in this category derive café sugar capability from this setting. */
  supportsSugarOptions: boolean;
  productCount: number;
}

export interface BrandDto {
  id: string;
  name: string;
  active: boolean;
  productCount: number;
}

export interface ProductDto {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  unit: string;
  categoryId: string;
  categoryName: string;
  brandId: string | null;
  brandName: string | null;
  purchaseCost: number;
  sellingPrice: number;
  minimumStock: number;
  trackExpiry: boolean;
  supportsSugarOptions: boolean;
  onlineVisible: boolean;
  description: string;
  active: boolean;
  sellable: number | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Categories                                                         */
/* ------------------------------------------------------------------ */

/** Lists categories with product counts. Requires `categories.read`. */
export async function listCategories(
  actor: AuthUser | null,
  activeOnly = false,
): Promise<CategoryDto[]> {
  requirePermission(actor, "categories.read");
  await dbConnect();
  const filter = activeOnly ? { active: true } : {};
  const categories = await CategoryModel.find(filter).sort({ name: 1 }).lean();
  const counts = await ProductModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { category: { $in: categories.map((c) => c._id) } } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));
  return categories.map((c) => ({
    id: c._id.toString(),
    name: c.name,
    active: c.active,
    supportsSugarOptions: c.supportsSugarOptions ?? false,
    productCount: countMap.get(c._id.toString()) ?? 0,
  }));
}

/** Creates a category. Requires `categories.manage`. */
export async function createCategory(actor: AuthUser | null, input: CategoryInput): Promise<CategoryDto> {
  const authed = requirePermission(actor, "categories.manage");
  await dbConnect();
  if (await CategoryModel.exists({ name: input.name })) {
    throw new AppError("CONFLICT", "توجد فئة بنفس الاسم بالفعل");
  }
  const category = await CategoryModel.create({
    name: input.name,
    active: input.active ?? true,
    supportsSugarOptions: input.supportsSugarOptions ?? false,
  });
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "category.created",
    entity: "category",
    entityId: category._id.toString(),
    after: { name: category.name, active: category.active, supportsSugarOptions: category.supportsSugarOptions },
  });
  return {
    id: category._id.toString(),
    name: category.name,
    active: category.active,
    supportsSugarOptions: category.supportsSugarOptions ?? false,
    productCount: 0,
  };
}

/** Updates a category. Requires `categories.manage`. */
export async function updateCategory(actor: AuthUser | null, id: string, input: CategoryInput): Promise<CategoryDto> {
  const authed = requirePermission(actor, "categories.manage");
  await dbConnect();
  const category = await CategoryModel.findById(id);
  if (!category) throw new AppError("NOT_FOUND", "الفئة غير موجودة");
  if (input.name !== category.name && (await CategoryModel.exists({ name: input.name }))) {
    throw new AppError("CONFLICT", "توجد فئة بنفس الاسم بالفعل");
  }
  const before = { name: category.name, active: category.active, supportsSugarOptions: category.supportsSugarOptions };
  category.name = input.name;
  if (input.active !== undefined) category.active = input.active;
  if (input.supportsSugarOptions !== undefined) category.supportsSugarOptions = input.supportsSugarOptions;
  await category.save();
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "category.updated",
    entity: "category",
    entityId: category._id.toString(),
    before,
    after: { name: category.name, active: category.active, supportsSugarOptions: category.supportsSugarOptions },
  });
  const productCount = await ProductModel.countDocuments({ category: category._id });
  return {
    id: category._id.toString(),
    name: category.name,
    active: category.active,
    supportsSugarOptions: category.supportsSugarOptions ?? false,
    productCount,
  };
}

/** Deactivates a category (keeps record). Requires `categories.manage`. */
export async function deactivateCategory(actor: AuthUser | null, id: string): Promise<CategoryDto> {
  const authed = requirePermission(actor, "categories.manage");
  await dbConnect();
  const category = await CategoryModel.findById(id);
  if (!category) throw new AppError("NOT_FOUND", "الفئة غير موجودة");
  category.active = false;
  await category.save();
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "category.deactivated",
    entity: "category",
    entityId: category._id.toString(),
  });
  return {
    id: category._id.toString(),
    name: category.name,
    active: false,
    supportsSugarOptions: category.supportsSugarOptions ?? false,
    productCount: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Brands                                                             */
/* ------------------------------------------------------------------ */

/** Lists brands with product counts. Requires `brands.read`. */
export async function listBrands(
  actor: AuthUser | null,
  activeOnly = false,
): Promise<BrandDto[]> {
  requirePermission(actor, "brands.read");
  await dbConnect();
  const filter = activeOnly ? { active: true } : {};
  const brands = await BrandModel.find(filter).sort({ name: 1 }).lean();
  const counts = await ProductModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { brand: { $in: brands.map((b) => b._id) } } },
    { $group: { _id: "$brand", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((b) => [b._id.toString(), b.count]));
  return brands.map((b) => ({
    id: b._id.toString(),
    name: b.name,
    active: b.active,
    productCount: countMap.get(b._id.toString()) ?? 0,
  }));
}

/** Creates a brand. Requires `brands.manage`. */
export async function createBrand(actor: AuthUser | null, input: BrandInput): Promise<BrandDto> {
  const authed = requirePermission(actor, "brands.manage");
  await dbConnect();
  if (await BrandModel.exists({ name: input.name })) {
    throw new AppError("CONFLICT", "توجد علامة تجارية بنفس الاسم بالفعل");
  }
  const brand = await BrandModel.create({ name: input.name, active: input.active ?? true });
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "brand.created",
    entity: "brand",
    entityId: brand._id.toString(),
    after: { name: brand.name, active: brand.active },
  });
  return { id: brand._id.toString(), name: brand.name, active: brand.active, productCount: 0 };
}

/** Updates a brand. Requires `brands.manage`. */
export async function updateBrand(actor: AuthUser | null, id: string, input: BrandInput): Promise<BrandDto> {
  const authed = requirePermission(actor, "brands.manage");
  await dbConnect();
  const brand = await BrandModel.findById(id);
  if (!brand) throw new AppError("NOT_FOUND", "العلامة التجارية غير موجودة");
  if (input.name !== brand.name && (await BrandModel.exists({ name: input.name }))) {
    throw new AppError("CONFLICT", "توجد علامة تجارية بنفس الاسم بالفعل");
  }
  brand.name = input.name;
  if (input.active !== undefined) brand.active = input.active;
  await brand.save();
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "brand.updated",
    entity: "brand",
    entityId: brand._id.toString(),
    after: { name: brand.name, active: brand.active },
  });
  return { id: brand._id.toString(), name: brand.name, active: brand.active, productCount: 0 };
}

/** Deactivates a brand (keeps record). Requires `brands.manage`. */
export async function deactivateBrand(actor: AuthUser | null, id: string): Promise<BrandDto> {
  const authed = requirePermission(actor, "brands.manage");
  await dbConnect();
  const brand = await BrandModel.findById(id);
  if (!brand) throw new AppError("NOT_FOUND", "العلامة التجارية غير موجودة");
  brand.active = false;
  await brand.save();
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "brand.deactivated",
    entity: "brand",
    entityId: brand._id.toString(),
  });
  return { id: brand._id.toString(), name: brand.name, active: false, productCount: 0 };
}

/* ------------------------------------------------------------------ */
/* Products                                                           */
/* ------------------------------------------------------------------ */

async function assertUniqueIdentifiers(
  barcode: string | undefined,
  sku: string | undefined,
  excludeId?: string,
): Promise<void> {
  if (barcode) {
    const dup = await ProductModel.findOne({ barcode, _id: { $ne: excludeId } }).select("_id").lean();
    if (dup) throw new AppError("CONFLICT", "يوجد منتج آخر بنفس الباركود");
  }
  if (sku) {
    const dup = await ProductModel.findOne({ sku, _id: { $ne: excludeId } }).select("_id").lean();
    if (dup) throw new AppError("CONFLICT", "يوجد منتج آخر بنفس رمز SKU");
  }
}

interface ResolvedCategory {
  _id: mongoose.Types.ObjectId;
  name: string;
  supportsSugarOptions: boolean;
}

async function loadCategory(
  categoryId: string,
): Promise<ResolvedCategory> {
  const category = await CategoryModel.findById(categoryId).lean<ResolvedCategory>();
  if (!category) throw new AppError("NOT_FOUND", "الفئة غير موجودة");
  return category;
}

async function loadBrand(brandId: string | undefined): Promise<{ _id: mongoose.Types.ObjectId; name: string } | null> {
  if (!brandId) return null;
  const brand = await BrandModel.findById(brandId).lean<{ _id: mongoose.Types.ObjectId; name: string }>();
  if (!brand) throw new AppError("NOT_FOUND", "العلامة التجارية غير موجودة");
  return brand;
}

/** Creates a product and its initial inventory state. Requires `products.create`. */
export async function createProduct(actor: AuthUser | null, input: ProductCreateInput): Promise<ProductDto> {
  const authed = requirePermission(actor, "products.create");
  await dbConnect();
  await assertUniqueIdentifiers(input.barcode || undefined, input.sku || undefined);
  const category = await loadCategory(input.categoryId);
  const brand = await loadBrand(input.brandId || undefined);

  const product = await ProductModel.create({
    name: input.name,
    barcode: input.barcode || undefined,
    sku: input.sku || undefined,
    category: category._id,
    brand: brand?._id,
    unit: input.unit,
    purchaseCost: input.purchaseCost,
    sellingPrice: input.sellingPrice,
    minimumStock: input.minimumStock,
    trackExpiry: input.trackExpiry ?? false,
    onlineVisible: input.onlineVisible ?? false,
    description: input.description || "",
    active: input.active ?? true,
  });

  await createInitialInventoryState(product._id);

  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "product.created",
    entity: "product",
    entityId: product._id.toString(),
    after: { name: product.name, barcode: product.barcode, sku: product.sku, category: category.name },
  });

  return toProductDto(
    product,
    category._id.toString(),
    category.name,
    brand?._id.toString() ?? null,
    brand?.name ?? null,
    0,
    category.supportsSugarOptions ?? false,
  );
}

/** Updates a product. Requires `products.update`. */
export async function updateProduct(
  actor: AuthUser | null,
  id: string,
  input: ProductUpdateInput,
): Promise<ProductDto> {
  const authed = requirePermission(actor, "products.update");
  await dbConnect();
  const product = await ProductModel.findById(id);
  if (!product) throw new AppError("NOT_FOUND", "المنتج غير موجود");
  await assertUniqueIdentifiers(input.barcode || undefined, input.sku || undefined, id);

  let categoryName = "";
  const category = input.categoryId ? await loadCategory(input.categoryId) : null;
  const brand = input.brandId !== undefined ? await loadBrand(input.brandId || undefined) : null;

  const before = {
    name: product.name,
    barcode: product.barcode,
    sku: product.sku,
    sellingPrice: product.sellingPrice,
    active: product.active,
  };

  if (input.name !== undefined) product.name = input.name;
  if (input.barcode !== undefined) product.barcode = input.barcode || undefined;
  if (input.sku !== undefined) product.sku = input.sku || undefined;
  if (category) {
    product.category = category._id;
    categoryName = category.name;
  }
  if (brand !== null) product.brand = brand?._id ?? null;
  if (input.unit !== undefined) product.unit = input.unit;
  if (input.purchaseCost !== undefined) product.purchaseCost = input.purchaseCost;
  if (input.sellingPrice !== undefined) product.sellingPrice = input.sellingPrice;
  if (input.minimumStock !== undefined) product.minimumStock = input.minimumStock;
  if (input.trackExpiry !== undefined) product.trackExpiry = input.trackExpiry;
  if (input.onlineVisible !== undefined) product.onlineVisible = input.onlineVisible;
  if (input.description !== undefined) product.description = input.description || "";
  if (input.active !== undefined) product.active = input.active;

  await product.save();

  const cat =
    category ?? (await CategoryModel.findById(product.category).lean<{ name: string; supportsSugarOptions: boolean }>());
  const br = brand !== null ? brand : (await BrandModel.findById(product.brand).lean<{ name: string }>());

  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "product.updated",
    entity: "product",
    entityId: product._id.toString(),
    before,
    after: { name: product.name, barcode: product.barcode, sku: product.sku, active: product.active },
  });

  return toProductDto(
    product,
    product.category?.toString?.() ?? "",
    cat?.name ?? categoryName ?? "",
    product.brand?.toString?.() ?? null,
    br?.name ?? null,
    await currentSellable(product._id.toString(), product.trackExpiry),
    cat?.supportsSugarOptions ?? false,
  );
}

/** Fetches a single product. Requires `products.read`. */
export async function getProduct(actor: AuthUser | null, id: string): Promise<ProductDto> {
  requirePermission(actor, "products.read");
  await dbConnect();
  const product = await ProductModel.findById(id)
    .populate("category", "name supportsSugarOptions")
    .populate("brand", "name")
    .lean<{
      _id: mongoose.Types.ObjectId;
      name: string;
      barcode?: string;
      sku?: string;
      unit: string;
      category: { _id: mongoose.Types.ObjectId; name: string; supportsSugarOptions: boolean } | null;
      brand: { _id: mongoose.Types.ObjectId; name: string } | null;
      purchaseCost: number;
      sellingPrice: number;
      minimumStock: number;
      trackExpiry: boolean;
      onlineVisible: boolean;
      description?: string;
      active: boolean;
      createdAt?: Date;
      updatedAt?: Date;
    }>();
  if (!product) throw new AppError("NOT_FOUND", "المنتج غير موجود");
  return toProductDto(
    product,
    product.category?._id?.toString() ?? "",
    product.category?.name ?? "",
    product.brand?._id?.toString() ?? null,
    product.brand?.name ?? null,
    await currentSellable(product._id.toString(), product.trackExpiry),
    product.category?.supportsSugarOptions ?? false,
  );
}

/** Lists / searches products with pagination. Requires `products.read`. */
export async function listProducts(actor: AuthUser | null, query: ProductQuery) {
  requirePermission(actor, "products.read");
  await dbConnect();

  const filter: Record<string, unknown> = {};
  if (query.status !== "all") filter.active = query.status === "active";
  if (query.categoryId) filter.category = query.categoryId;
  if (query.brandId) filter.brand = query.brandId;
  if (query.q) {
    const re = query.q;
    filter.$or = [
      { name: { $regex: re, $options: "i" } },
      { barcode: { $regex: re } },
      { sku: { $regex: re } },
    ];
  }

  const [products, total] = await Promise.all([
    ProductModel.find(filter)
      .populate("category", "name supportsSugarOptions")
      .populate("brand", "name")
      .sort({ name: 1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    ProductModel.countDocuments(filter),
  ]);

  const items = await Promise.all(
    products.map(async (p) => {
      const category = p.category as
        | { _id?: mongoose.Types.ObjectId; name?: string; supportsSugarOptions?: boolean }
        | null
        | undefined;
      const brand = p.brand as { _id?: mongoose.Types.ObjectId; name?: string } | null | undefined;
      return toProductDto(
        p,
        category?._id?.toString() ?? "",
        category?.name ?? "",
        brand?._id?.toString() ?? null,
        brand?.name ?? null,
        await currentSellable(p._id.toString(), p.trackExpiry),
        category?.supportsSugarOptions ?? false,
      );
    }),
  );

  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** Disables or re-enables a product. Requires `products.disable`. */
export async function setProductActive(
  actor: AuthUser | null,
  id: string,
  active: boolean,
): Promise<ProductDto> {
  const authed = requirePermission(actor, "products.disable");
  await dbConnect();
  const product = await ProductModel.findById(id);
  if (!product) throw new AppError("NOT_FOUND", "المنتج غير موجود");
  product.active = active;
  await product.save();
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: active ? "product.activated" : "product.disabled",
    entity: "product",
    entityId: product._id.toString(),
    after: { active },
  });
  const cat = await CategoryModel.findById(product.category)
    .lean<{ name: string; supportsSugarOptions: boolean }>()
    .catch(() => null);
  return toProductDto(
    product,
    product.category?.toString?.() ?? "",
    cat?.name ?? "",
    product.brand?.toString?.() ?? null,
    null,
    await currentSellable(product._id.toString(), product.trackExpiry),
    cat?.supportsSugarOptions ?? false,
  );
}

async function currentSellable(productId: string, trackExpiry: boolean): Promise<number> {
  const stock = await getSellableStock(productId, trackExpiry);
  return stock.sellable;
}

function toProductDto(
  p: {
    _id: mongoose.Types.ObjectId | string;
    name: string;
    barcode?: string;
    sku?: string;
    unit: string;
    purchaseCost: number;
    sellingPrice: number;
    minimumStock: number;
    trackExpiry: boolean;
    onlineVisible: boolean;
    description?: string;
    active: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  },
  categoryId: string,
  categoryName: string,
  brandId: string | null,
  brandName: string | null,
  sellable: number,
  /** Café sugar capability resolved from the product's Category config. */
  supportsSugarOptions: boolean,
): ProductDto {
  return {
    id: p._id.toString(),
    name: p.name,
    barcode: p.barcode ?? null,
    sku: p.sku ?? null,
    unit: p.unit,
    categoryId,
    categoryName,
    brandId,
    brandName,
    purchaseCost: p.purchaseCost,
    sellingPrice: p.sellingPrice,
    minimumStock: p.minimumStock,
    trackExpiry: p.trackExpiry,
    supportsSugarOptions,
    onlineVisible: p.onlineVisible,
    description: p.description ?? "",
    active: p.active,
    sellable,
    createdAt: p.createdAt?.toISOString() ?? "",
    updatedAt: p.updatedAt?.toISOString() ?? "",
  };
}
