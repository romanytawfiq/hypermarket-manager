import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listUsers, listRoles } from "@/services/identity.service";
import { AppError } from "@/lib/errors";
import { UsersManager } from "@/components/users/users-manager";

export const metadata: Metadata = {
  title: "المستخدمون — نكسا ريتيل",
};

export default async function UsersPage() {
  const user = (await getCurrentUser())!;

  let users;
  let roles;
  try {
    [users, roles] = await Promise.all([listUsers(user), listRoles(user)]);
  } catch (error) {
    // Page-level gate: users without the permission are not shown the screen.
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return <UsersManager users={users} roles={roles} currentUserId={user.id} />;
}
