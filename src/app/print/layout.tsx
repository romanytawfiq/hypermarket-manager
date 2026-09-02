import type { Metadata } from "next";

/**
 * Dedicated receipt print pages.
 *
 * These documents are intentionally excluded from search indexing and are not
 * part of the dashboard shell. Every page resolves the session user
 * server-side and loads the authorized receipt view model before rendering —
 * anonymous or unauthorized access never reaches the document.
 */
export const metadata: Metadata = {
  title: "طباعة الفاتورة — نكسا ريتيل",
  robots: { index: false, follow: false },
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white p-4 sm:p-6 print:p-0 print:m-0">{children}</div>
  );
}