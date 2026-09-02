import { AutoPrint } from "@/components/printing/auto-print";
import {
  ReceiptDocument,
  type ReceiptWidth,
} from "@/components/printing/receipt-document";
import type { ReceiptViewModel } from "@/services/receipt.service";

const PRINT_TITLES: Record<ReceiptViewModel["kind"], string> = {
  "sale": "فاتورة بيع",
  "cafe-order": "فاتورة كافيه",
  "customer-payment": "إيصال سداد",
};

/**
 * Render frame for dedicated print pages (Phase 8).
 *
 * Server-side printable document: the authorized receipt view model is wrapped
 * with the auto-print control and a screen-only preview card. Screen chrome is
 * stripped by the print stylesheet so the browser prints the receipt only.
 */
export function PrintPage({
  receipt,
  width,
}: {
  receipt: ReceiptViewModel;
  width: ReceiptWidth;
}) {
  return (
    <div className="mx-auto max-w-2xl print:max-w-none">
      <h1 className="sr-only">{PRINT_TITLES[receipt.kind]}</h1>
      <AutoPrint />
      <div className="rounded-lg border border-zinc-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <ReceiptDocument receipt={receipt} width={width} />
      </div>
    </div>
  );
}