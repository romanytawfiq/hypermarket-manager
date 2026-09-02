import type { ReceiptViewModel } from "@/services/receipt.service";
import {
  RECEIPT_STORE_NAME,
  RECEIPT_STORE_TAGLINE,
  RECEIPT_FOOTER_TEXT,
} from "@/lib/printing/config";
import { formatDateTime, formatEgp } from "@/lib/format";

export type ReceiptWidth = "58mm" | "80mm";

export const RECEIPT_WIDTHS: readonly ReceiptWidth[] = ["58mm", "80mm"];

function rendererLabels(kind: ReceiptViewModel["kind"]) {
  switch (kind) {
    case "sale":
      return { title: "فاتورة بيع", referenceLabel: "رقم الفاتورة", actorLabel: "الكاشير" };
    case "cafe-order":
      return { title: "فاتورة كافيه", referenceLabel: "رقم الطلب", actorLabel: "أُنشئ بواسطة" };
    case "customer-payment":
      return { title: "إيصال سداد", referenceLabel: "رقم الإيصال", actorLabel: "أُنشئ بواسطة" };
  }
}

/**
 * Shared thermal receipt document (Phase 8).
 *
 * Pure presentation: consumes an already-authorized `ReceiptViewModel` loaded
 * server-side and renders a narrow, RTL, monochrome layout sized for 58mm or
 * 80mm thermal paper. The print CSS uses a dedicated `@page` size per width so
 * browser printing produces a single sheet with no margins. Could be rendered
 * by a Server Component (print route) or a Client Component (preview dialog).
 */
export function ReceiptDocument({
  receipt,
  width = "80mm",
}: {
  receipt: ReceiptViewModel;
  width?: ReceiptWidth;
}) {
  const labels = rendererLabels(receipt.kind);
  const creditRemaining = receipt.paymentState !== "PAID";

  return (
    <>
      <style>{receiptPrintCss(width)}</style>
      <div dir="rtl" className={`receipt-doc receipt-doc--${width}`} data-receipt-kind={receipt.kind}>
        <header className="rd-header">
          <p className="rd-store-name">{RECEIPT_STORE_NAME}</p>
          <p className="rd-tagline">{RECEIPT_STORE_TAGLINE}</p>
          <p className="rd-title">{labels.title}</p>
        </header>

        <div className="rd-sep" />

        <div className="rd-block">
          {receipt.kind === "cafe-order" ? (
            <>
              <RdRow label="رقم الطلب" value={receipt.orderNumber ?? receipt.referenceNumber} ltr />
              <RdRow label="رقم الفاتورة" value={receipt.invoiceNumber ?? ""} ltr />
            </>
          ) : (
            <RdRow label={labels.referenceLabel} value={receipt.referenceNumber} ltr />
          )}
          <RdRow label="التاريخ" value={formatDateTime(receipt.createdAt)} />
          <RdRow label={labels.actorLabel} value={receipt.actorUsername || "—"} />
          {receipt.customerName ? <RdRow label="العميل" value={receipt.customerName} /> : null}
        </div>

        <div className="rd-sep" />

        <div className="rd-block">
          {receipt.items.map((item, idx) => (
            <div key={idx} className="rd-item">
              <div className="rd-item-row">
                <span className="rd-item-name">
                  {idx + 1}. {item.name}
                </span>
                <span className="rd-item-amount">{formatEgp(item.lineTotal)}</span>
              </div>
              <div className="rd-item-sub">
                <span>
                  {item.quantity} × {formatEgp(item.unitPrice)}
                </span>
                {item.note ? <span className="rd-item-note">{item.note}</span> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="rd-sep" />

        <div className="rd-block">
          <RdRow label="الإجمالي" value={formatEgp(receipt.totalAmount)} strong />
          {receipt.payments.map((p, i) => (
            <RdRow key={`${p.method}-${i}`} label={p.methodLabel} value={formatEgp(p.amount)} />
          ))}
          {receipt.cashTendered != null ? (
            <RdRow label="المدفوع نقدًا" value={formatEgp(receipt.cashTendered)} />
          ) : null}
          {receipt.change != null && receipt.change > 0 ? (
            <RdRow label="الباقي" value={formatEgp(receipt.change)} />
          ) : null}
          {creditRemaining ? (
            <>
              <RdRow label="المدفوع من الحساب" value={formatEgp(receipt.totalPaid)} />
              <RdRow label="المتبقي (دَيْن)" value={formatEgp(receipt.balanceDue)} strong />
            </>
          ) : null}
        </div>

        {creditRemaining ? (
          <p className="rd-credit-note">
            فاتورة على الحساب — باقي {formatEgp(receipt.balanceDue)} على العميل
          </p>
        ) : null}

        <div className="rd-sep" />

        <footer className="rd-footer">{RECEIPT_FOOTER_TEXT}</footer>
      </div>
    </>
  );
}

function RdRow({
  label,
  value,
  strong,
  ltr,
}: {
  label: string;
  value: string;
  strong?: boolean;
  ltr?: boolean;
}) {
  return (
    <div className="rd-row">
      <span className="rd-row-label">{label}</span>
      <span
        className={strong ? "rd-row-value rd-row-value--strong" : "rd-row-value"}
        dir={ltr ? "ltr" : "rtl"}
      >
        {value}
      </span>
    </div>
  );
}

function receiptPrintCss(width: ReceiptWidth): string {
  return `
.receipt-doc {
  margin: 0 auto;
  background: #ffffff;
  color: #000000;
  font-family: var(--font-noto-sans-arabic), "Cairo", system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.45;
  direction: rtl;
  text-align: right;
  --rd-font-11: 11px;
  --rd-font-10: 10px;
  --rd-font-9: 9px;
}
.receipt-doc--58mm { width: 54mm; padding: 0 1mm; font-size: var(--rd-font-9); }
.receipt-doc--58mm .rd-title { font-size: var(--rd-font-10); }
.receipt-doc--80mm { width: 76mm; padding: 0 2mm; font-size: var(--rd-font-10); }
.receipt-doc--80mm .rd-title { font-size: var(--rd-font-11); }

.rd-header { text-align: center; }
.rd-store-name { font-weight: 700; font-size: 1.1em; margin: 0; }
.rd-tagline { margin: 0; opacity: 0.75; font-weight: 500; }
.rd-title { margin: 2px 0 0; font-weight: 700; }

.rd-sep {
  border-top: 1px dashed #000000;
  margin: 6px 0;
}

.rd-block { display: grid; gap: 2px; }

.rd-row { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; }
.rd-row-label { white-space: normal; overflow-wrap: break-word; min-width: 0; flex-shrink: 1; }
.rd-row-value { text-align: start; font-variant-numeric: tabular-nums; white-space: normal; overflow-wrap: break-word; min-width: 0; flex-shrink: 1; }
.rd-row-value--strong { font-weight: 700; }

.rd-item { padding: 1px 0; }
.rd-item-row { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; }
.rd-item-name { font-weight: 500; white-space: normal; overflow-wrap: break-word; min-width: 0; flex-shrink: 1; hyphens: auto; }
.rd-item-amount { font-variant-numeric: tabular-nums; white-space: nowrap; flex-shrink: 0; }
.rd-item-sub {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
  font-size: 0.92em;
  opacity: 0.8;
  flex-wrap: wrap;
}
.rd-item-note { font-style: normal; white-space: normal; overflow-wrap: break-word; min-width: 0; }

.rd-credit-note {
  margin: 4px 0 0;
  background: #ffffff;
  border: 1px dashed #000000;
  padding: 2px 4px;
  text-align: center;
  font-weight: 500;
}

.rd-footer { text-align: center; }

@media print {
  @page { size: ${width} auto; margin: 0; }
  html, body { background: #ffffff !important; }
  .receipt-doc {
    box-shadow: none !important;
    border: none !important;
    margin: 0 auto;
  }
  .receipt-doc--58mm, .receipt-doc--80mm { width: ${width === "58mm" ? "56mm" : "76mm"}; padding: 0; }
}
`;
}