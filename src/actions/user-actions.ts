"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createUserSchema, updateUserSchema, type CreateUserInput, type UpdateUserInput } from "@/lib/validations/identity";
import {
  createUser,
  updateUser,
  deactivateUser,
  activateUser,
} from "@/services/identity.service";
import { resolveError } from "@/lib/errors";

/**
 * User-management Server Actions.
 *
 * Authorization is enforced by the identity service against the server-resolved
 * current user — never client-supplied role data. Every action re-validates its
 * input server-side and returns a safe Arabic message.
 */

export interface UserActionState {
  error?: string;
  success?: boolean;
}

export async function createUserAction(
  input: CreateUserInput,
): Promise<UserActionState> {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  }

  try {
    const actor = await getCurrentUser();
    await createUser(actor, parsed.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }

  revalidatePath("/users");
  return { success: true };
}

export async function updateUserAction(
  userId: string,
  input: UpdateUserInput,
): Promise<UserActionState> {
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  }

  try {
    const actor = await getCurrentUser();
    await updateUser(actor, userId, parsed.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }

  revalidatePath("/users");
  return { success: true };
}

export async function deactivateUserAction(userId: string): Promise<UserActionState> {
  try {
    const actor = await getCurrentUser();
    await deactivateUser(actor, userId);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/users");
  return { success: true };
}

export async function activateUserAction(userId: string): Promise<UserActionState> {
  try {
    const actor = await getCurrentUser();
    await activateUser(actor, userId);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/users");
  return { success: true };
}
