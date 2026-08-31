import { describe, it, expect, beforeAll } from "vitest";
import { AppError } from "@/lib/errors";
import {
  authenticate,
  destroySession,
  getSessionUser,
} from "@/services/auth.service";
import { SessionModel } from "@/models/session";
import { resetDb, createUser, TEST_PASSWORD } from "@/test/helpers";

describe("authentication", () => {
  let owner: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    await resetDb();
    owner = await createUser({
      username: "owner",
      password: TEST_PASSWORD,
      role: "OWNER",
      isOwner: true,
    });
  });

  it("authenticates a valid owner and returns a usable session", async () => {
    const { token, user } = await authenticate(owner.username, TEST_PASSWORD);
    expect(token).toBeTruthy();
    expect(user.username).toBe(owner.username);
    expect(user.role).toBe("OWNER");
    expect(user.permissions.has("roles.manage")).toBe(true);

    const sessionUser = await getSessionUser(token);
    expect(sessionUser?.id).toBe(owner.id);
  });

  it("rejects a wrong password with the same safe message as an unknown user", async () => {
    let wrongMessage: string | undefined;
    try {
      await authenticate(owner.username, "WrongPass@123");
    } catch (error) {
      if (error instanceof AppError) {
        expect(error.code).toBe("UNAUTHORIZED");
        wrongMessage = error.userMessage;
      }
    }
    expect(wrongMessage).toBeTruthy();

    let unknownMessage: string | undefined;
    try {
      await authenticate("no-such-user", TEST_PASSWORD);
    } catch (error) {
      if (error instanceof AppError) {
        unknownMessage = error.userMessage;
      }
    }
    // Identical message → no account enumeration.
    expect(unknownMessage).toBe(wrongMessage);
  });

  it("blocks an inactive user from authenticating (anti-enumeration)", async () => {
    const disabled = await createUser({
      username: "disabled-cashier",
      password: TEST_PASSWORD,
      role: "CASHIER",
      active: false,
    });
    let message: string | undefined;
    try {
      await authenticate(disabled.username, TEST_PASSWORD);
    } catch (error) {
      if (error instanceof AppError) {
        expect(error.code).toBe("UNAUTHORIZED");
        message = error.userMessage;
      }
    }
    expect(message).toBeTruthy();
  });

  it("returns null for an unknown token", async () => {
    const sessionUser = await getSessionUser("definitely-not-a-real-token");
    expect(sessionUser).toBeNull();
  });

  it("returns null after the session is destroyed (logout)", async () => {
    const { token } = await authenticate(owner.username, TEST_PASSWORD);
    const existed = await destroySession(token);
    expect(existed).toBe(true);
    await expect(getSessionUser(token)).resolves.toBeNull();
  });

  it("treats an expired session as invalid and removes it", async () => {
    const { token } = await authenticate(owner.username, TEST_PASSWORD);
    await SessionModel.updateMany(
      {},
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    await expect(getSessionUser(token)).resolves.toBeNull();
    const remaining = await SessionModel.countDocuments({
      expiresAt: { $lte: new Date() },
    });
    expect(remaining).toBe(0);
  });
});
