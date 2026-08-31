import type mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { dbConnect } from "@/lib/db";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/session-token";
import { SESSION_TTL_MS } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { UserModel, type UserDocument } from "@/models/user";
import { RoleModel, type RoleDocument } from "@/models/role";
import { SessionModel } from "@/models/session";
import type { RoleId } from "@/lib/access-control/roles";

/**
 * The authenticated user as seen by server-side code.
 *
 * Never exposes the password hash or session internals. `permissions` is the
 * resolved set of permission identifiers for the user's role.
 */
export interface AuthUser {
  id: string;
  username: string;
  name: string;
  active: boolean;
  /** Role document ObjectId (string). */
  roleId: string;
  role: RoleId;
  isOwner: boolean;
  permissions: ReadonlySet<string>;
}

/** Message intentionally identical for unknown-user and wrong-password cases. */
const INVALID_CREDENTIALS =
  "اسم المستخدم أو كلمة المرور غير صحيحة";

/** Resolves a User document plus its Role into an AuthUser (fail-closed). */
export async function toAuthUser(user: UserDocument, role: RoleDocument | null): Promise<AuthUser> {
  const roleName = role?.name;
  const permissions = new Set<string>(role?.permissions ?? []);
  return {
    id: (user._id as mongoose.Types.ObjectId).toString(),
    username: user.username,
    name: user.name,
    active: user.active,
    roleId: role ? (role._id as mongoose.Types.ObjectId).toString() : "",
    role: (roleName ?? "CASHIER") as RoleId,
    isOwner: Boolean(user.isOwner),
    permissions,
  };
}

/** Loads the Role document referenced by a user, or null when it is missing. */
export async function loadUserRole(user: UserDocument): Promise<RoleDocument | null> {
  if (!user.role) return null;
  try {
    return await RoleModel.findById(user.role).lean<RoleDocument>();
  } catch {
    return null;
  }
}

/**
 * Resolves an opaque session token to the authenticated user.
 * Returns null when the session is missing, expired, or its user is inactive.
 */
export async function getSessionUser(token: string): Promise<AuthUser | null> {
  await dbConnect();

  const tokenHash = hashSessionToken(token);
  const session = await SessionModel.findOne({ tokenHash }).lean<SessionDocument>();
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await SessionModel.deleteOne({ _id: session._id }).exec();
    return null;
  }

  const user = await UserModel.findById(session.userId).lean<UserDocument>();
  if (!user || !user.active) return null;

  const role = await loadUserRole(user);
  return toAuthUser(user, role);
}

interface SessionDocument {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  expiresAt: Date;
}

/**
 * Authenticates a user by username + password.
 *
 * Returns a fresh opaque session token and the auth user, or throws a
 * UNAUTHORIZED AppError. The same safe message is used for unknown users,
 * wrong passwords, and inactive accounts to avoid account enumeration.
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  await dbConnect();

  const normalized = username.trim().toLowerCase();
  const user = await UserModel.findOne({ username: normalized }).lean<UserDocument>();
  if (!user || !user.active) {
    throw new AppError("UNAUTHORIZED", INVALID_CREDENTIALS);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError("UNAUTHORIZED", INVALID_CREDENTIALS);
  }

  const role = await loadUserRole(user);
  const authUser = await toAuthUser(user, role);

  const token = generateSessionToken();
  await SessionModel.create({
    tokenHash: hashSessionToken(token),
    userId: user._id,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  return { token, user: authUser };
}

/** Destroys a session (logout / revocation). Returns whether it existed. */
export async function destroySession(token: string): Promise<boolean> {
  await dbConnect();
  const result = await SessionModel.deleteOne({ tokenHash: hashSessionToken(token) }).exec();
  return result.deletedCount > 0;
}

/** Revokes every active session for a user. */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await dbConnect();
  await SessionModel.deleteMany({ userId }).exec();
}

/** Session lifetime in milliseconds (exported for tests / cookie parity). */
export const sessionTtlMs = () => SESSION_TTL_MS;
