import Link from "next/link";

/**
 * Friendly error state for dedicated print pages (Phase 8).
 *
 * Shown when a receipt cannot be prepared (unauthorized, not found, or the
 * linked record is missing). The message is the safe Arabic user message from
 * the domain error — internal details are never exposed.
 */
export function PrintError({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-8 max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <p className="text-lg font-semibold">تعذر تحضير الفاتورة</p>
      <p className="mt-2 text-sm text-zinc-500">{message}</p>
      <span className="mt-4 inline-block">
        <Link
          className="rounded-md border px-4 py-2 text-sm font-medium no-underline hover:bg-zinc-100"
          href="/"
        >
          العودة إلى الرئيسية
        </Link>
      </span>
    </div>
  );
}