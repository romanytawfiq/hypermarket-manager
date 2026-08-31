import { describe, it, expect, beforeAll } from "vitest";
import { AppError } from "@/lib/errors";
import {
  createUser as serviceCreateUser,
  updateUser,
  deactivateUser,
  activateUser,
  getUser,
  listUsers,
} from "@/services/identity.service";
import { authenticate } from "@/services/auth.service";
import {
  resetDb,
  createUser,
  buildAuthUser,
  TEST_PASSWORD,
} from "@/test/helpers";

describe("identity / user management", () => {
  let owner: Awaited<ReturnType<typeof createUser>>;
  let ownerActor: Awaited<ReturnType<typeof buildAuthUser>>;

  beforeAll(async () => {
    await resetDb();
    owner = await createUser({
      username: "owner",
      password: TEST_PASSWORD,
      role: "OWNER",
      isOwner: true,
    });
    ownerActor = await buildAuthUser(owner);
  });

  it("allows an Owner to create a user", async () => {
    const dto = await serviceCreateUser(ownerActor, {
      username: "new-cashier",
      name: "كاشير جديد",
      password: "StrongPass@1",
      roleId: (await createUser({ username: "x-role", role: "CASHIER" })).roleId,
      active: true,
    });
    expect(dto.username).toBe("new-cashier");
    expect(dto.active).toBe(true);
    expect(dto.roleName).toBe("CASHIER");
  });

  it("rejects creation without users.create", async () => {
    const cashier = await createUser({ username: "cashier", role: "CASHIER" });
    const cashierActor = await buildAuthUser(cashier);
    let caught: unknown;
    try {
      await serviceCreateUser(cashierActor, {
        username: "should-fail",
        name: "فشل",
        password: "StrongPass@1",
        roleId: owner.roleId, // correct shape, wrong actor
        active: true,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });

  it("rejects a duplicate username (CONFLICT)", async () => {
    await serviceCreateUser(ownerActor, {
      username: "unique-user",
      name: "مستخدم",
      password: "StrongPass@1",
      roleId: (await createUser({ username: "x-role2", role: "ACCOUNTANT" })).roleId,
      active: true,
    });
    let caught: unknown;
    try {
      await serviceCreateUser(ownerActor, {
        username: "UNIQUE-USER", // same lowercase, different case
        name: "مكرر",
        password: "StrongPass@1",
        roleId: (await createUser({ username: "x-role3", role: "ACCOUNTANT" })).roleId,
        active: true,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("prevents privilege escalation when assigning a role with more permissions", async () => {
    const manager = await createUser({ username: "manager", role: "MANAGER" });
    const managerActor = await buildAuthUser(manager);
    // Manager lacks roles.manage → cannot assign OWNER (superset of its perms).
    let caught: unknown;
    try {
      await serviceCreateUser(managerActor, {
        username: "illegal-owner",
        name: "مالك غير مشروع",
        password: "StrongPass@1",
        roleId: owner.roleId,
        active: true,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });

  it("allows a Manager to assign roles whose permissions are a subset", async () => {
    const manager = await createUser({ username: "manager2", role: "MANAGER" });
    const managerActor = await buildAuthUser(manager);
    const accountantRole = (
      await createUser({ username: "x-role-acct", role: "ACCOUNTANT" })
    ).roleId;
    const dto = await serviceCreateUser(managerActor, {
      username: "legal-accountant",
      name: "محاسب",
      password: "StrongPass@1",
      roleId: accountantRole,
      active: true,
    });
    expect(dto.roleName).toBe("ACCOUNTANT");
  });

  it("updates a user name and role", async () => {
    const target = await createUser({ username: "update-me", role: "CASHIER" });
    const manager = await createUser({ username: "manager3", role: "MANAGER" });
    const managerActor = await buildAuthUser(manager);
    const accountantRole = (
      await createUser({ username: "x-role-acct2", role: "ACCOUNTANT" })
    ).roleId;
    const dto = await updateUser(managerActor, target.id, {
      name: "اسم جديد",
      roleId: accountantRole,
    });
    expect(dto.name).toBe("اسم جديد");
    expect(dto.roleName).toBe("ACCOUNTANT");
  });

  it("prevents deactivating yourself", async () => {
    let caught: unknown;
    try {
      await deactivateUser(ownerActor, owner.id);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("prevents removing the last active Owner", async () => {
    // owner is the only active owner → cannot move it off the OWNER role.
    const cashierRole = (
      await createUser({ username: "x-role-cash", role: "CASHIER" })
    ).roleId;
    let caught: unknown;
    try {
      await updateUser(ownerActor, owner.id, { roleId: cashierRole });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("deactivation prevents the user from authenticating", async () => {
    const target = await createUser({
      username: "to-disable",
      password: TEST_PASSWORD,
      role: "CASHIER",
    });
    await deactivateUser(ownerActor, target.id);

    let caught: unknown;
    try {
      await authenticate("to-disable", TEST_PASSWORD);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("UNAUTHORIZED");
  });

  it("reactivates a disabled user and grants a new password", async () => {
    const target = await createUser({
      username: "to-reactivate",
      password: TEST_PASSWORD,
      role: "CASHIER",
    });
    await deactivateUser(ownerActor, target.id);
    const dto = await activateUser(ownerActor, target.id);
    // Update password server-side is a separate admin reset.
    const updated = await updateUser(ownerActor, target.id, {
      newPassword: "NewPass@123",
    });
    expect(dto.active).toBe(true);
    expect(await authenticate("to-reactivate", "NewPass@123")).toBeTruthy();
    void updated;
  });

  it("listUsers and getUser return safe DTOs for authorized actors", async () => {
    const users = await listUsers(ownerActor);
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u).toHaveProperty("username");
      expect(u).not.toHaveProperty("passwordHash");
    }
    const single = await getUser(ownerActor, owner.id);
    expect(single.username).toBe("owner");
  });
});
