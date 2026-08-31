import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listCustomers } from "@/services/customer.service";
import { AppError } from "@/lib/errors";
import { CustomersManager } from "@/components/customers/customers-manager";

export const metadata: Metadata = {
  title: "العملاء — نكسا ريتيل",
};

export default async function CustomersPage() {
  const user = (await getCurrentUser())!;

  let customers;
  try {
    customers = await listCustomers(user);
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return (
    <CustomersManager
      customers={customers}
      canCreate={user.permissions.has("customers.create")}
      canUpdate={user.permissions.has("customers.update")}
      canDisable={user.permissions.has("customers.disable")}
    />
  );
}
