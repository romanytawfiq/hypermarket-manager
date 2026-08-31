import { describe, it, expect, beforeEach } from "vitest";
import { RoleModel } from "@/models/role";
import {
  defaultPermissionsForRole,
} from "@/lib/access-control/roles";
import { getNavItems } from "@/lib/navigation";
import { hasPermission } from "@/lib/access-control/permission";
import { seedPermissions, seedRoles } from "@/lib/seed";
import type { AuthUser } from "@/services/auth.service";
import { resetDb, createUser, type TestUser } from "@/test/helpers";

/**
 * Regression tests for POS dashboard access.
 *
 * Background: `seedRoles()` previously stored each role's `permissions` array
 * exclusively through `$setOnInsert`. Role documents created during earlier
 * phases therefore never received permissions introduced by later phases
 * (Phase 4+ POS: `sales.create`, `shifts.open`, `receipts.print`, ...). In the
 * live database the `CASHIER` role held ZERO permissions, so a cashier saw no
 * "نقطة البيع" navigation item and direct access to `/pos` (guarded by
 * `sales.create`) redirected home. These tests reproduce that stale state and
 * prove that re-running the seed now merges the missing defaults back in.
 *
 * `navActor()` mirrors the real runtime path (`auth.service.toAuthUser`): the
 * permission set is read from the role document stored in the database, not
 * from `defaultPermissionsForRole` directly.
 */

async function navActor(actor: TestUser): Promise<AuthUser> {
  const role = await RoleModel.findById(actor.roleId).lean();
  const permissions = new Set<string>(role?.permissions ?? []);
  return {
    id: actor.id,
    username: actor.username,
    name: actor.username,
    active: true,
    roleId: actor.roleId,
    role: actor.role,
    isOwner: actor.isOwner,
    permissions,
  };
}

describe("POS dashboard access (regression: seed merge + navigation)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("re-running the seed merges missing phase permissions into a stale CASHIER role", async () => {
    // Reproduce the live bug: a CASHIER role seeded before Phase 4 has no
    // POS permissions stored.
    await RoleModel.updateOne(
      { name: "CASHIER" },
      { $set: { permissions: [] } },
    );
    let stored = await RoleModel.findOne({ name: "CASHIER" }).lean();
    expect(stored?.permissions).toEqual([]);

    // Running the now-idempotent seed re-applies the canonical defaults
    // (additive merge).
    const touched = await seedPermissions();
    await seedRoles();

    stored = await RoleModel.findOne({ name: "CASHIER" }).lean();
    const perms = new Set<string>(stored?.permissions ?? []);
    expect(perms.has("sales.create")).toBe(true);
    expect(perms.has("shifts.open")).toBe(true);
    expect(perms.has("receipts.print")).toBe(true);
    expect(perms.has("customers.credit")).toBe(true);
    expect((stored?.permissions as string[]).length).toBe(
      defaultPermissionsForRole("CASHIER").length,
    );
    expect(touched).toBeGreaterThanOrEqual(0);
  });

  it("does not duplicate permissions when the seed runs repeatedly (idempotency)", async () => {
    await seedRoles();
    await seedRoles();
    const cashier = await RoleModel.findOne({ name: "CASHIER" }).lean();
    const unique = new Set<string>(cashier?.permissions ?? []);
    expect(unique.size).toBe((cashier?.permissions as string[]).length);
  });

  it("preserves any admin-granted extra permission after a reseed", async () => {
    await RoleModel.updateOne(
      { name: "CASHIER" },
      { $addToSet: { permissions: "inventory.read" } },
    );
    await seedRoles();
    const cashier = await RoleModel.findOne({ name: "CASHIER" }).lean();
    const perms = new Set<string>(cashier?.permissions ?? []);
    expect(perms.has("inventory.read")).toBe(true);
    expect(perms.has("sales.create")).toBe(true);
  });

  it("shows the POS navigation item to an authorized cashier", async () => {
    const cashier = await createUser({ username: "nexx_cashier1", role: "CASHIER" });
    const actor = await navActor(cashier);
    // `/pos` is guarded by `sales.create` in getNavItems.
    expect(hasPermission(actor, "sales.create", actor.permissions)).toBe(true);
    const labels = getNavItems(actor).map((n) => n.href);
    expect(labels).toContain("/pos");
    const pos = getNavItems(actor).find((n) => n.href === "/pos");
    expect(pos?.label).toBe("نقطة البيع");
  });

  it("hides the POS navigation item from unauthorized roles", async () => {
    const accountant = await createUser({ username: "nexx_acct1", role: "ACCOUNTANT" });
    const warehouse = await createUser({ username: "nexx_wh1", role: "WAREHOUSE_EMPLOYEE" });
    const barista = await createUser({ username: "nexx_bar1", role: "BARISTA" });

    for (const u of [accountant, warehouse, barista]) {
      const actor = await navActor(u);
      const hrefs = getNavItems(actor).map((n) => n.href);
      expect(hrefs).not.toContain("/pos");
      // Server-side guard (`sales.create`) also rejects direct `/pos` access.
      expect(hasPermission(actor, "sales.create", actor.permissions)).toBe(false);
    }
  });

  it("a cashier sees the POS route entry and the /pos guard passes", async () => {
    // Mirrors src/app/(dashboard)/pos/page.tsx: the page early-returns when
    // the user lacks `sales.create`.
    const cashier = await createUser({ username: "nexx_cashier2", role: "CASHIER" });
    const actor = await navActor(cashier);
    expect(actor.permissions.has("sales.create")).toBe(true);
  });

  it("ACCOUNTANT role reads receipts but cannot create sales (no POS)", async () => {
    const accountant = await createUser({ username: "nexx_acct2", role: "ACCOUNTANT" });
    const actor = await navActor(accountant);
    expect(actor.permissions.has("receipts.print")).toBe(true);
    expect(actor.permissions.has("sales.create")).toBe(false);
  });
});
