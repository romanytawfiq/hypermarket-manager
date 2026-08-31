import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authenticate } from "@/services/auth.service";
import { seedDevOwner } from "@/lib/seed";
import { UserModel } from "@/models/user";
import { resetDb, roleIdOf } from "@/test/helpers";

/**
 * Regression tests for the dev-owner bootstrap.
 *
 * Background: the live database contained an active `admin` owner whose
 * `passwordHash` was the plaintext value `admin` instead of a bcrypt hash. As
 * a result bcrypt.compare always returned false and `authenticate()` rejected
 * the correct documented credentials (admin / admin). These tests reproduce
 * that state and prove that re-running the seed bootstrap self-heals it.
 */
describe("seed dev-owner self-healing (regression)", () => {
  const DEV_PASSWORD = "admin";

  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    delete process.env.SEED_OWNER_PASSWORD;
    delete process.env.SEED_OWNER_USERNAME;
  });

  it("accepts a valid password only after repairing a corrupted (plaintext) hash", async () => {
    // Simulate the corrupted state observed in the live DB: an active Owner
    // whose passwordHash is stored in plaintext rather than as a bcrypt hash.
    await UserModel.create({
      username: "admin",
      name: "المالك",
      passwordHash: DEV_PASSWORD,
      role: await roleIdOf("OWNER"),
      active: true,
      isOwner: true,
    });

    // Before repair: correct credentials are rejected because bcrypt.compare
    // cannot verify a plaintext hash. This reproduces the reported bug.
    await expect(authenticate("admin", DEV_PASSWORD)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    // Running the documented bootstrap self-heals the owner's hash and returns
    // true to signal the owner was changed.
    process.env.SEED_OWNER_PASSWORD = DEV_PASSWORD;
    process.env.SEED_OWNER_USERNAME = "admin";
    const repaired = await seedDevOwner();
    expect(repaired).toBe(true);

    // After repair: the same credentials now authenticate successfully.
    const { token, user } = await authenticate("admin", DEV_PASSWORD);
    expect(token).toBeTruthy();
    expect(user.username).toBe("admin");
    expect(user.role).toBe("OWNER");
  });

  it("leaves an existing owner untouched when its hash already verifies", async () => {
    process.env.SEED_OWNER_PASSWORD = DEV_PASSWORD;
    process.env.SEED_OWNER_USERNAME = "admin";

    const created = await seedDevOwner();
    expect(created).toBe(true);

    const user = await UserModel.findOne({ username: "admin" }).lean();
    const originalHash = user?.passwordHash;
    expect(originalHash).toBeTruthy();

    const second = await seedDevOwner();
    expect(second).toBe(false);

    const after = await UserModel.findOne({ username: "admin" }).lean();
    expect(after?.passwordHash).toBe(originalHash);
  });
});
