import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listSuppliers } from "@/services/supplier.service";
import { AppError } from "@/lib/errors";
import { SuppliersManager } from "@/components/suppliers/suppliers-manager";

export const metadata: Metadata = {
  title: "الموردون — نكسا ريتيل",
};

export default async function SuppliersPage() {
  const user = (await getCurrentUser())!;

  let suppliers;
  let canViewLedger;
  try {
    suppliers = await listSuppliers(user);
    canViewLedger = user.permissions.has("suppliers.view_ledger");
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return (
    <SuppliersManager
      suppliers={suppliers}
      canCreate={user.permissions.has("suppliers.create")}
      canUpdate={user.permissions.has("suppliers.update")}
      canDisable={user.permissions.has("suppliers.disable")}
      canViewLedger={canViewLedger}
    />
  );
}
