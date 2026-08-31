import { describe, it, expect, beforeAll } from "vitest";
import { AppError } from "@/lib/errors";
import { hasPermission } from "@/lib/access-control/permission";
import { PERMISSIONS } from "@/lib/access-control/permissions";
import {
  requirePermission,
  can,
} from "@/services/authorization.service";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

describe("authorization / RBAC enforcement", () => {
  beforeAll(async () => {
    await resetDb();
  });

  it("grants an Owner every permission in the catalog", async () => {
    const owner = await createUser({ username: "owner", role: "OWNER", isOwner: true });
    const actor = await buildAuthUser(owner);
    for (const permission of PERMISSIONS) {
      expect(hasPermission(actor, permission)).toBe(true);
    }
  });

  it("grants a Cashier no permissions", async () => {
    const cashier = await createUser({ username: "cashier", role: "CASHIER" });
    const actor = await buildAuthUser(cashier);
    for (const permission of PERMISSIONS) {
      expect(hasPermission(actor, permission)).toBe(false);
    }
  });

  it("requirePermission passes for an authorized actor", async () => {
    const manager = await createUser({ username: "manager", role: "MANAGER" });
    const actor = await buildAuthUser(manager);
    const result = requirePermission(actor, "users.read");
    expect(result).toEqual(actor);
  });

  it("requirePermission throws FORBIDDEN for an unauthorized actor", async () => {
    const cashier = await createUser({ username: "cashier2", role: "CASHIER" });
    const actor = await buildAuthUser(cashier);
    expect(() => requirePermission(actor, "users.read")).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("requirePermission throws UNAUTHORIZED when no actor is present", async () => {
    expect(() => requirePermission(null, "users.read")).toThrowError(
      expect.objectContaining({ code: "UNAUTHORIZED" }),
    );
  });

  it("can() reports authorization without throwing", async () => {
    const manager = await createUser({ username: "manager3", role: "MANAGER" });
    const cashier = await createUser({ username: "cashier3", role: "CASHIER" });
    const managerActor = await buildAuthUser(manager);
    const cashierActor = await buildAuthUser(cashier);
    expect(can(managerActor, "users.read")).toBe(true);
    expect(can(cashierActor, "users.read")).toBe(false);
  });

  it("throws a real AppError that UI can render safely", async () => {
    const cashier = await createUser({ username: "cashier4", role: "CASHIER" });
    const actor = await buildAuthUser(cashier);
    let caught: unknown;
    try {
      requirePermission(actor, "roles.manage");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) {
      expect(caught.userMessage).toBeTruthy();
    }
  });
});
