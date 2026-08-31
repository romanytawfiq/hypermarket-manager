import { dbConnect } from "@/lib/db";
import { PermissionModel } from "@/models/permission";
import { RoleModel } from "@/models/role";
import { UserModel, type UserDocument } from "@/models/user";
import { PERMISSIONS, type PermissionId } from "@/lib/access-control/permissions";
import { ROLES, ROLE_LABELS, defaultPermissionsForRole } from "@/lib/access-control/roles";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { isProduction } from "@/lib/env";

/**
 * Idempotent system seeding.
 *
 * Safe to run more than once: permissions and roles are upserted by stable key
 * and the development owner is only created when it does not already exist.
 *
 * No production credentials are committed. The development owner password is
 * supplied via environment variables and skipped entirely in production.
 */

interface SeedResult {
  permissionsCreated: number;
  rolesUpserted: number;
  /** True when the dev owner was created or repaired by this run. */
  devOwnerEnsured: boolean;
}

const PERMISSION_LABELS: Record<PermissionId, { label: string; scope: string; description: string }> = {
  "users.read": { label: "عرض المستخدمين", scope: "users", description: "عرض قائمة المستخدمين وتفاصيلهم" },
  "users.create": { label: "إنشاء مستخدم", scope: "users", description: "إنشاء مستخدم جديد" },
  "users.update": { label: "تعديل المستخدم", scope: "users", description: "تعديل بيانات المستخدم ودوره" },
  "users.disable": { label: "تعطيل/تفعيل المستخدم", scope: "users", description: "تفعيل أو تعطيل حساب المستخدم" },
  "roles.read": { label: "عرض الأدوار", scope: "roles", description: "عرض قائمة الأدوار والصلاحيات" },
  "roles.manage": { label: "إدارة الأدوار والصلاحيات", scope: "roles", description: "تعديل الأدوار وصلاحياتها" },
  "products.read": { label: "عرض المنتجات", scope: "products", description: "عرض المنتجات والبحث فيها" },
  "products.create": { label: "إنشاء منتج", scope: "products", description: "إنشاء منتج جديد" },
  "products.update": { label: "تعديل منتج", scope: "products", description: "تعديل بيانات المنتج والأسعار" },
  "products.disable": { label: "تعطيل/تفعيل منتج", scope: "products", description: "تفعيل أو تعطيل المنتج" },
  "categories.read": { label: "عرض الفئات", scope: "categories", description: "عرض فئات المنتجات" },
  "categories.manage": { label: "إدارة الفئات", scope: "categories", description: "إنشاء وتعديل وتعطيل الفئات" },
  "brands.read": { label: "عرض العلامات التجارية", scope: "brands", description: "عرض العلامات التجارية" },
  "brands.manage": { label: "إدارة العلامات التجارية", scope: "brands", description: "إنشاء وتعديل وتعطيل العلامات التجارية" },
  "inventory.read": { label: "عرض المخزون", scope: "inventory", description: "عرض حالة المخزون الحالية" },
  "inventory.adjust": { label: "تعديل المخزون", scope: "inventory", description: "تنفيذ تعديلات المخزون" },
  "inventory.count": { label: "جرد المخزون", scope: "inventory", description: "إجراء جرد وتسوية للمخزون" },
  "inventory.view_movements": { label: "عرض حركات المخزون", scope: "inventory", description: "عرض سجل حركات المخزون" },
  "inventory.view_expiry": { label: "عرض انتهاء الصلاحية", scope: "inventory", description: "عرض المنتجات والبضائع المنتهية أو القريبة من الانتهاء" },
  "inventory.view_replenishment": { label: "عرض إعادة التخزين", scope: "inventory", description: "عرض مقترحات إعادة التخزين" },
  "suppliers.read": { label: "عرض الموردين", scope: "suppliers", description: "عرض الموردين ورصيدهم وأرصدة المستحقات" },
  "suppliers.create": { label: "إنشاء مورد", scope: "suppliers", description: "إنشاء مورد جديد" },
  "suppliers.update": { label: "تعديل مورد", scope: "suppliers", description: "تعديل بيانات المورد" },
  "suppliers.disable": { label: "تعطيل/تفعيل مورد", scope: "suppliers", description: "تفعيل أو تعطيل المورد" },
  "suppliers.view_ledger": { label: "عرض حركات المورد المالية", scope: "suppliers", description: "عرض سجل الحركات المالية للمورد" },
  "purchases.read": { label: "عرض المشتريات", scope: "purchases", description: "عرض سجل المشتريات والاستلام" },
  "purchases.create": { label: "إنشاء شراء", scope: "purchases", description: "تسجيل شراء جديد من مورد" },
  "purchases.receive": { label: "استلام مشتريات", scope: "purchases", description: "استلام الكميات المقدمة للشراء وزيادة المخزون" },
  "purchases.return": { label: "مرتجع مشتريات", scope: "purchases", description: "تسجيل مرتجع مشتريات للمورد" },
  "supplier_payments.read": { label: "عرض مدفوعات الموردين", scope: "supplier_payments", description: "عرض سجل المدفوعات للموردين" },
  "supplier_payments.create": { label: "تسجيل دفعة مورد", scope: "supplier_payments", description: "تسجيل دفعة جديدة لمورد" },
  "customers.read": { label: "عرض العملاء", scope: "customers", description: "عرض العملاء وأرصدتهم ومستحقاتهم" },
  "customers.create": { label: "إنشاء عميل", scope: "customers", description: "إنشاء عميل جديد" },
  "customers.update": { label: "تعديل عميل", scope: "customers", description: "تعديل بيانات العميل وحد الائتمان" },
  "customers.disable": { label: "تعطيل/تفعيل عميل", scope: "customers", description: "تفعيل أو تعطيل العميل (بدون حذف)" },
  "customers.view_ledger": { label: "عرض كشف حساب العميل", scope: "customers", description: "عرض سجل الحركات المالية للعميل" },
  "customers.credit": { label: "بيع على الحساب", scope: "customers", description: "إتمام عملية بيع آجل على حساب العميل" },
  "customer_payments.read": { label: "عرض مدفوعات العملاء", scope: "customer_payments", description: "عرض سجل مدفوعات العملاء" },
  "customer_payments.create": { label: "تسجيل دفعة عميل", scope: "customer_payments", description: "تسجيل دفعة جديدة من عميل لسداد المستحقات" },
  "expense_categories.read": { label: "عرض فئات المصروفات", scope: "expense_categories", description: "عرض فئات المصروفات" },
  "expense_categories.manage": { label: "إدارة فئات المصروفات", scope: "expense_categories", description: "إنشاء وتعديل وتعطيل فئات المصروفات" },
  "expenses.read": { label: "عرض المصروفات", scope: "expenses", description: "عرض سجل المصروفات وتفاصيلها" },
  "expenses.create": { label: "تسجيل مصروف", scope: "expenses", description: "تسجيل مصروف جديد ضمن فئة محددة" },
  "accounting.read": { label: "عرض الملخص المحاسبي", scope: "accounting", description: "عرض نظرة عامة على المحاسبة والتدفقات النقدية" },
  "sales.read": { label: "عرض المبيعات", scope: "sales", description: "عرض سجل المبيعات والفواتير" },
  "sales.create": { label: "إنشاء بيع", scope: "sales", description: "إتمام عملية بيع من نقطة البيع" },
  "payments.read": { label: "عرض المدفوعات", scope: "payments", description: "عرض المدفوعات وتفاصيلها" },
  "shifts.read": { label: "عرض الورديات", scope: "shifts", description: "عرض الورديات وحالة كل وردية" },
  "shifts.open": { label: "فتح وردية", scope: "shifts", description: "فتح وردية كاشير جديدة" },
  "shifts.close": { label: "إغلاق وردية", scope: "shifts", description: "إغلاق الوردية وحساب المبلغ المتوقع والفرق" },
  "cash_movements.read": { label: "عرض حركات الخزينة", scope: "cash_movements", description: "عرض حركات النقد المرتبطة بالورديات" },
  "cash_movements.create": { label: "تسجيل حركة نقد", scope: "cash_movements", description: "تسجيل إيداع أو سحب أو مصروف نقدي" },
  "receipts.print": { label: "طباعة الفواتير", scope: "receipts", description: "طباعة إيصالات وفواتير البيع" },
  "reports.view": { label: "عرض التقارير", scope: "reports", description: "عرض التقارير التشغيلية" },
  "settings.view": { label: "عرض الإعدادات", scope: "settings", description: "عرض إعدادات النظام" },
  "settings.manage": { label: "إدارة الإعدادات", scope: "settings", description: "تعديل إعدادات النظام" },
};

/** Creates any missing Permission documents from the catalog. */
export async function seedPermissions(): Promise<number> {
  let created = 0;
  for (const key of PERMISSIONS) {
    const meta = PERMISSION_LABELS[key];
    const result = await PermissionModel.updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          label: meta.label,
          scope: meta.scope,
          description: meta.description,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) created += 1;
  }
  return created;
}

/** Upserts the system roles with their default permission sets. */
export async function seedRoles(): Promise<number> {
  let upserted = 0;
  for (const name of ROLES) {
    const result = await RoleModel.updateOne(
      { name },
      {
        $setOnInsert: {
          name,
          label: ROLE_LABELS[name],
          permissions: defaultPermissionsForRole(name),
          system: true,
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) upserted += 1;
  }
  return upserted;
}

interface SeedEnv {
  username: string;
  password: string;
  name: string;
}

function readDevOwnerEnv(): SeedEnv | null {
  const username = process.env.SEED_OWNER_USERNAME?.trim() || "owner";
  const password = process.env.SEED_OWNER_PASSWORD;
  const name = process.env.SEED_OWNER_NAME?.trim() || "المالك";
  if (!password) return null;
  return { username, password, name };
}

/**
 * Bootstraps a development Owner (skipped in production).
 *
 * The Owner is the only way to reach the highest privilege initially because
 * only an Owner can assign the Owner role. This bootstrap is idempotent.
 *
 * If the dev owner already exists, its stored password hash is verified
 * against `SEED_OWNER_PASSWORD`. When the hash is missing, malformed (e.g. a
 * plaintext value), or simply wrong, it is re-hashed to a fresh bcrypt hash so
 * re-running `npm run seed` self-heals a corrupted owner. The password is
 * never reset to anything other than the developer-supplied
 * `SEED_OWNER_PASSWORD`, so no secret is hardcoded or weakened.
 */
export async function seedDevOwner(): Promise<boolean> {
  if (isProduction) return false;

  const seed = readDevOwnerEnv();
  if (!seed) {
    console.warn(
      "[seed] SEED_OWNER_PASSWORD not set; skipping development owner bootstrap.",
    );
    return false;
  }

  const ownerRole = await RoleModel.findOne({ name: "OWNER" }).lean();
  if (!ownerRole) {
    console.warn("[seed] Owner role not found; run role seeding first.");
    return false;
  }

  const username = seed.username.toLowerCase();
  const existing = await UserModel.findOne({ username }).lean<UserDocument>();

  if (!existing) {
    const passwordHash = await hashPassword(seed.password);
    await UserModel.create({
      username,
      name: seed.name,
      passwordHash,
      role: ownerRole._id,
      active: true,
      isOwner: true,
    });
    return true;
  }

  // Re-hash when the stored hash cannot be verified against the configured
  // dev password. `verifyPassword` returns false for plaintext/malformed hashes.
  const valid = await verifyPassword(seed.password, existing.passwordHash);
  if (valid) return false;

  const passwordHash = await hashPassword(seed.password);
  await UserModel.updateOne(
    { _id: existing._id },
    { $set: { passwordHash, role: ownerRole._id, active: true, isOwner: true } },
  );
  console.warn(
    "[seed] Repaired dev owner password hash (stored value could not be verified).",
  );
  return true;
}

/** Seeds permissions, roles, and (non-production) the dev owner. */
export async function runSeed(): Promise<SeedResult> {
  await dbConnect();
  const permissionsCreated = await seedPermissions();
  const rolesUpserted = await seedRoles();
  const devOwnerEnsured = await seedDevOwner();

  if (!isProduction) {
    const ownerRole = await RoleModel.findOne({ name: "OWNER" }).select("_id").lean();
    const ownerCount = ownerRole
      ? await UserModel.countDocuments({ role: ownerRole._id })
      : 0;
    console.info(
      `[seed] done. permissionsCreated=${permissionsCreated} rolesUpserted=${rolesUpserted} devOwnerEnsured=${devOwnerEnsured} activeOwners=${ownerCount}`,
    );
  }

  return { permissionsCreated, rolesUpserted, devOwnerEnsured };
}
