/**
 * Shared helpers for Phase 1 (identity & auth) integration tests.
 *
 * Runs against the in-memory MongoDB replica set started by `setup.ts`
 * (one instance per Vitest worker, stopped+cleaned up in teardown). Each test
 * file calls `resetDb()` in `beforeEach`/`beforeAll` to get a clean, seeded
 * state.
 */
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { seedPermissions, seedRoles } from "@/lib/seed";
import { hashPassword } from "@/lib/auth/password";
import { defaultPermissionsForRole, type RoleId } from "@/lib/access-control/roles";
import { UserModel } from "@/models/user";
import { RoleModel } from "@/models/role";
import type { AuthUser } from "@/services/auth.service";

/** Connects, drops all collections, and re-seeds permissions + roles. */
export async function resetDb(): Promise<void> {
  await dbConnect();
  await mongoose.connection.dropDatabase();
  await seedPermissions();
  await seedRoles();
}

/** Drops collections without re-seeding (for tests that seed themselves). */
export async function clearDb(): Promise<void> {
  await dbConnect();
  await mongoose.connection.dropDatabase();
}

export interface TestUser {
  id: string;
  username: string;
  role: RoleId;
  roleId: string;
  isOwner: boolean;
}

/** Creates a user with the given role using the seeded roles. */
export async function createUser(opts: {
  username: string;
  password?: string;
  role: RoleId;
  name?: string;
  active?: boolean;
  isOwner?: boolean;
}): Promise<TestUser> {
  const role = await RoleModel.findOne({ name: opts.role });
  if (!role) {
    throw new Error(`role not found: ${opts.role}`);
  }
  const passwordHash = await hashPassword(opts.password ?? "Password@123");
  const user = await UserModel.create({
    username: opts.username,
    name: opts.name ?? opts.username,
    passwordHash,
    role: role._id,
    active: opts.active ?? true,
    isOwner: opts.isOwner ?? false,
  });
  return {
    id: (user._id as mongoose.Types.ObjectId).toString(),
    username: user.username,
    role: opts.role,
    roleId: (role._id as mongoose.Types.ObjectId).toString(),
    isOwner: opts.isOwner ?? false,
  };
}

export const TEST_PASSWORD = "Password@123";

/** Returns the seeded Role document's ObjectId (string) for a role name. */
export async function roleIdOf(role: RoleId): Promise<string> {
  const doc = await RoleModel.findOne({ name: role }).select("_id").lean();
  if (!doc) {
    throw new Error(`role not found: ${role}`);
  }
  return (doc._id as mongoose.Types.ObjectId).toString();
}

/**
 * Builds an AuthUser for an actor directly (bypassing a session).
 *
 * Permissions are resolved from the seeded role for accuracy to the real
 * runtime path.
 */
export async function buildAuthUser(
  actor: TestUser,
  overrides?: Partial<AuthUser>,
): Promise<AuthUser> {
  const permissions = new Set<string>(defaultPermissionsForRole(actor.role));
  return {
    id: actor.id,
    username: actor.username,
    name: actor.username,
    active: true,
    roleId: actor.roleId,
    role: actor.role,
    isOwner: actor.isOwner,
    permissions,
    ...overrides,
  };
}
