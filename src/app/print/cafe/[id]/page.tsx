import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCafeReceiptViewModel, type ReceiptViewModel } from "@/services/receipt.service";
import { resolveError } from "@/lib/errors";
import { parseReceiptWidth } from "@/lib/printing/width";
import { PrintPage } from "@/components/printing/print-page";
import { PrintError } from "@/components/printing/print-error";

export const dynamic = "force-dynamic";

export default async function CafeReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const { id } = await params;
  const width = parseReceiptWidth((await searchParams).w);
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let receipt: ReceiptViewModel | null = null;
  let errorMessage = "";
  try {
    receipt = await getCafeReceiptViewModel(user, id);
  } catch (error) {
    errorMessage = resolveError(error).userMessage;
  }

  if (!receipt) {
    return <PrintError message={errorMessage || "تعذر تحضير الفاتورة."} />;
  }

  return <PrintPage receipt={receipt} width={width} />;
}