import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCustomer, listCustomerLedger, listCustomerPayments } from "@/services/customer.service";
import { AppError } from "@/lib/errors";
import { CustomerDetail } from "@/components/customers/customer-detail";

export const metadata: Metadata = {
  title: "تفاصيل العميل — نكسا ريتيل",
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getCurrentUser())!;

  let customer;
  let ledger: Awaited<ReturnType<typeof listCustomerLedger>> = [];
  let payments: Awaited<ReturnType<typeof listCustomerPayments>> = [];

  try {
    customer = await getCustomer(user, id);
    const perms = user.permissions;
    const [l, p] = await Promise.all([
      perms.has("customers.view_ledger") ? listCustomerLedger(user, id) : Promise.resolve([]),
      perms.has("customer_payments.read") ? listCustomerPayments(user, id) : Promise.resolve([]),
    ]);
    ledger = l;
    payments = p;
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <CustomerDetail
      customer={customer}
      ledger={ledger}
      payments={payments}
      canCollect={user.permissions.has("customer_payments.create")}
      canUpdate={user.permissions.has("customers.update")}
      canPrintReceipts={user.permissions.has("receipts.print")}
    />
  );
}
