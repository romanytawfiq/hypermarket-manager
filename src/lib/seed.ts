import { dbConnect } from "@/lib/db";
import { PermissionModel } from "@/models/permission";
import { RoleModel } from "@/models/role";
import { UserModel } from "@/models/user";
import { PERMISSIONS, type PermissionId } from "@/lib/access-control/permissions";
import { ROLES, ROLE_LABELS, defaultPermissionsForRole } from "@/lib/access-control/roles";
import { hashPassword } from "@/lib/auth/password";
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
  devOwnerCreated: boolean;
}

const PERMISSION_LABELS: Record<PermissionId, { label: string; scope: string; description: string }> = {
  "users.read": { label: "عرض المستخدمين", scope: "users", description: "عرض قائمة المستخدمين وتفاصيلهم" },
  "users.create": { label: "إنشاء مستخدم", scope: "users", description: "إنشاء مستخدم جديد" },
  "users.update": { label: "تعديل المستخدم", scope: "users", description: "تعديل بيانات المستخدم ودوره" },
  "users.disable": { label: "تعطيل/تفعيل المستخدم", scope: "users", description: "تفعيل أو تعطيل حساب المستخدم" },
  "roles.read": { label: "عرض الأدوار", scope: "roles", description: "عرض قائمة الأدوار والصلاحيات" },
  "roles.manage": { label: "إدارة الأدوار والصلاحيات", scope: "roles", description: "تعديل الأدوار وصلاحياتها" },
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

  const exists = await UserModel.exists({ username: seed.username.toLowerCase() });
  if (exists) return false;

  const passwordHash = await hashPassword(seed.password);
  await UserModel.create({
    username: seed.username.toLowerCase(),
    name: seed.name,
    passwordHash,
    role: ownerRole._id,
    active: true,
    isOwner: true,
  });
  return true;
}

/** Seeds permissions, roles, and (non-production) the dev owner. */
export async function runSeed(): Promise<SeedResult> {
  await dbConnect();
  const permissionsCreated = await seedPermissions();
  const rolesUpserted = await seedRoles();
  const devOwnerCreated = await seedDevOwner();

  if (!isProduction) {
    const ownerRole = await RoleModel.findOne({ name: "OWNER" }).select("_id").lean();
    const ownerCount = ownerRole
      ? await UserModel.countDocuments({ role: ownerRole._id })
      : 0;
    console.info(
      `[seed] done. permissionsCreated=${permissionsCreated} rolesUpserted=${rolesUpserted} devOwnerCreated=${devOwnerCreated} activeOwners=${ownerCount}`,
    );
  }

  return { permissionsCreated, rolesUpserted, devOwnerCreated };
}
