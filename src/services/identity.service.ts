import type mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { dbConnect } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { requirePermission } from "@/services/authorization.service";
import { recordAudit } from "@/services/audit.service";
import { revokeAllUserSessions } from "@/services/auth.service";
import type { AuthUser } from "@/services/auth.service";
import { UserModel } from "@/models/user";
import { RoleModel } from "@/models/role";
import type { CreateUserInput, UpdateUserInput } from "@/lib/validations/identity";
import { PERMISSION_SET } from "@/lib/access-control/permissions";
import type { PermissionId } from "@/lib/access-control/permissions";
import { ROLE_LABELS, type RoleId } from "@/lib/access-control/roles";

/**
 * Internal user (identity) management.
 *
 * Every mutation authorizes the acting user server-side and guards against
 * privilege escalation. Users are deactivated rather than physically deleted:
 * deactivation preserves the record while preventing authentication
 * (docs/architecture.md §15, BR historical integrity).
 */

/** Safe, user-facing representation (never exposes the password hash). */
export interface UserDto {
  id: string;
  username: string;
  name: string;
  active: boolean;
  isOwner: boolean;
  roleId: string;
  roleName: RoleId;
  roleLabel: string;
  createdAt: string;
}

function toUserDto(
  user: { _id: mongoose.Types.ObjectId; username: string; name: string; active: boolean; isOwner?: boolean; role: mongoose.Types.ObjectId },
  roleName: RoleId,
  roleLabel: string,
): UserDto {
  return {
    id: user._id.toString(),
    username: user.username,
    name: user.name,
    active: user.active,
    isOwner: Boolean(user.isOwner),
    roleId: user.role.toString(),
    roleName,
    roleLabel,
    createdAt: "", // filled below when a full doc is available
  };
}

function isSubset(required: ReadonlySet<string>, available: ReadonlySet<string>): boolean {
  for (const item of required) {
    if (!available.has(item)) return false;
  }
  return true;
}

/** Loads a role by id, returning the permission set, name, and label. */
async function loadRole(roleId: string) {
  const role = await RoleModel.findById(roleId).lean<{
    _id: mongoose.Types.ObjectId;
    name: RoleId;
    label: string;
    permissions: PermissionId[];
    system: boolean;
  }>();
  if (!role) {
    throw new AppError("VALIDATION", "الدور غير موجود");
  }
  return role;
}

/**
 * Prevents privilege escalation: an actor may only assign a role whose
 * permission set is a subset of the actor's own permissions.
 */
function assertNoEscalation(actor: AuthUser, targetRolePermissions: readonly string[]): void {
  if (!isSubset(new Set(targetRolePermissions), actor.permissions)) {
    throw new AppError("FORBIDDEN", "ليس لديك صلاحية لتعيين هذا الدور");
  }
}

/** Assigning the Owner role requires the permission-management capability. */
function assertCanManageOwnership(actor: AuthUser, targetRoleName: RoleId): void {
  if (targetRoleName === "OWNER" && !actor.permissions.has("roles.manage")) {
    throw new AppError("FORBIDDEN", "ليس لديك صلاحية لتعيين دور المالك");
  }
}

/** Counts active users holding the Owner role, excluding `excludeUserId`. */
async function countOtherActiveOwners(excludeUserId: mongoose.Types.ObjectId): Promise<number> {
  const ownerRoleName: RoleId = "OWNER";
  // Find the Owner role document (seeded singleton by name).
  const ownerRole = await RoleModel.findOne({ name: ownerRoleName }).select("_id").lean<{ _id: mongoose.Types.ObjectId }>();
  if (!ownerRole) return 0;
  return UserModel.countDocuments({
    _id: { $ne: excludeUserId },
    role: ownerRole._id,
    active: true,
  });
}

/** Creates a new user. Requires `users.create`. */
export async function createUser(actor: AuthUser | null, input: CreateUserInput): Promise<UserDto> {
  const authed = requirePermission(actor, "users.create");
  await dbConnect();

  const role = await loadRole(input.roleId);
  assertNoEscalation(authed, role.permissions);
  assertCanManageOwnership(authed, role.name);

  const existing = await UserModel.exists({ username: input.username.toLowerCase() });
  if (existing) {
    throw new AppError("CONFLICT", "اسم المستخدم مستخدم بالفعل");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await UserModel.create({
    username: input.username.toLowerCase(),
    name: input.name,
    passwordHash,
    role: role._id,
    active: input.active !== false,
  });

  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "user.created",
    entity: "user",
    entityId: user._id.toString(),
    after: { username: user.username, role: role.name, active: user.active },
  });

  return toUserDto(user, role.name, role.label);
}

/** Lists users. Requires `users.read`. Populates role label. */
export async function listUsers(actor: AuthUser | null): Promise<UserDto[]> {
  requirePermission(actor, "users.read");
  await dbConnect();

  const users = await UserModel.find().sort({ createdAt: 1 }).lean();
  const roles = new Map(
    (await RoleModel.find().select("_id name label").lean()).map((r) => [
      r._id.toString(),
      { name: r.name as RoleId, label: r.label },
    ]),
  );

  return users.map((u) => {
    const role = roles.get(u.role.toString());
    return {
      id: u._id.toString(),
      username: u.username,
      name: u.name,
      active: u.active,
      isOwner: Boolean(u.isOwner),
      roleId: u.role.toString(),
      roleName: role?.name ?? "CASHIER",
      roleLabel: role?.label ?? "",
      createdAt: u.createdAt?.toISOString() ?? "",
    };
  });
}

/** Fetches a single user. Requires `users.read`. */
export async function getUser(actor: AuthUser | null, userId: string): Promise<UserDto> {
  requirePermission(actor, "users.read");
  await dbConnect();

  const user = await UserModel.findById(userId).lean();
  if (!user) {
    throw new AppError("NOT_FOUND", "المستخدم غير موجود");
  }

  const role = await RoleModel.findById(user.role).lean<{ name: RoleId; label: string }>();
  return toUserDto(user, role?.name ?? "CASHIER", role?.label ?? "");
}

/**
 * Updates a user (name / role / active / password). Requires `users.update`.
 * Owner and privilege-escalation guards apply.
 */
export async function updateUser(
  actor: AuthUser | null,
  userId: string,
  input: UpdateUserInput,
  self?: boolean,
): Promise<UserDto> {
  const authed = requirePermission(actor, "users.update");
  await dbConnect();

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError("NOT_FOUND", "المستخدم غير موجود");
  }

  const isSelf = user._id.toString() === authed.id;

  // An actor may only modify an Owner with the ownership-management capability.
  if (user.isOwner && !authed.permissions.has("roles.manage")) {
    throw new AppError("FORBIDDEN", "ليس لديك صلاحية لتعديل المالك");
  }

  // Resolve target role if a role change is requested.
  const currentRole = await loadRole(user.role.toString());
  const currentRoleName = currentRole.name;
  let nextRoleId = user.role;
  let nextRoleName: RoleId = currentRoleName;
  if (input.roleId && input.roleId !== user.role.toString()) {
    const role = await loadRole(input.roleId);
    assertNoEscalation(authed, role.permissions);
    assertCanManageOwnership(authed, role.name);
    nextRoleId = role._id;
    nextRoleName = role.name;
  }

  // Resolve activation change.
  const nextActive = input.active !== undefined ? input.active : user.active;

  // Prevent removing ownership from the last active Owner (would leave the
  // application with zero administrative users).
  const currentlyOwner = user.isOwner || currentRoleName === "OWNER";
  const stillOwnerAfter = nextActive === true && nextRoleName === "OWNER";
  if (currentlyOwner && !stillOwnerAfter) {
    const others = await countOtherActiveOwners(user._id);
    if (others < 1) {
      throw new AppError("CONFLICT", "لا يمكن إزالة آخر مالك نشط");
    }
  }

  // Prevent deactivating yourself (would lock yourself out).
  if (isSelf && nextActive === false && user.active) {
    throw new AppError("CONFLICT", "لا يمكنك تعطيل حسابك الحالي");
  }

  const before: Record<string, unknown> = {
    name: user.name,
    role: user.role.toString(),
    active: user.active,
  };

  if (input.name !== undefined) user.name = input.name;
  if (input.newPassword !== undefined) user.passwordHash = await hashPassword(input.newPassword);
  if (input.roleId && input.roleId !== user.role.toString()) {
    user.role = nextRoleId;
    if (nextRoleName !== "OWNER") user.isOwner = false;
  }
  if (input.active !== undefined) user.active = nextActive;

  await user.save();

  // Revoke sessions if the user was deactivated.
  if (user.active === false && before.active === true) {
    await revokeAllUserSessions(user._id.toString());
  }

  let roleAfterName: RoleId = nextRoleName;
  let roleAfterLabel = ROLE_LABELS[nextRoleName] ?? "دور";
  const roleAfter = await RoleModel.findById(user.role).lean<{
    name: RoleId;
    label: string;
  }>();
  if (roleAfter) {
    roleAfterName = roleAfter.name;
    roleAfterLabel = roleAfter.label;
  }

  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "user.updated",
    entity: "user",
    entityId: user._id.toString(),
    before,
    after: { name: user.name, role: roleAfterName, active: user.active },
    metadata: { self },
  });

  return toUserDto(user, roleAfterName, roleAfterLabel);
}

/** Deactivates a user. Requires `users.disable`. */
export async function deactivateUser(actor: AuthUser | null, userId: string): Promise<UserDto> {
  const authed = requirePermission(actor, "users.disable");
  return updateUser(authed, userId, { active: false });
}

/** Reactivates a user. Requires `users.disable`. */
export async function activateUser(actor: AuthUser | null, userId: string): Promise<UserDto> {
  const authed = requirePermission(actor, "users.disable");
  return updateUser(authed, userId, { active: true });
}

/** Lists available roles (id, name, label) for assignment forms. Requires `roles.read`. */
export async function listRoles(actor: AuthUser | null) {
  requirePermission(actor, "roles.read");
  await dbConnect();
  const roles = await RoleModel.find().sort({ createdAt: 1 }).lean();
  return roles.map((r) => ({
    id: r._id.toString(),
    name: r.name,
    label: r.label,
    permissions: r.permissions,
    system: r.system,
  }));
}

export { PERMISSION_SET };
