import Link from "next/link";
import { ShoppingCartIcon, StoreIcon } from "lucide-react";
import type { Metadata } from "next";
import { env } from "@/lib/env";

/**
 * Public online storefront (Phase 9).
 *
 * Indexable, customer-facing store, deliberately separate from the private
 * `(dashboard)` group (which is `robots: noindex`). Mobile-first, Arabic-first
 * RTL. Everything under `/store`.
 */
const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "متجر نكسا ريتيل — تسوق أونلاين",
  description:
    "تسوق من متجر نكسا ريتيل: منتجات التجزئة والكافيه على الإنترنت مع الدفع عند الاستلام.",
  openGraph: {
    type: "website",
    locale: "ar_EG",
    url: `${appUrl}/store`,
    siteName: "نكسا ريتيل",
    title: "متجر نكسا ريتيل",
    description:
      "تسوق من متجر نكسا ريتيل: منتجات التجزئة والكافيه على الإنترنت مع الدفع عند الاستلام.",
  },
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky px-12 top-0 z-20 flex items-center justify-between gap-2 border-b bg-background/95 py-3 backdrop-blur">
        <Link
          href="/store"
          className="flex items-center gap-2 font-heading text-base font-bold"
        >
          <StoreIcon className="size-5 text-primary" aria-hidden />
          متجر نكسا
        </Link>
        <nav className="flex items-center gap-1" aria-label="متجر">
          <Link
            href="/store"
            className="rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            المنتجات
          </Link>
          <Link
            href="/store/track"
            className="rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            تتبع الطلب
          </Link>
          <Link
            href="/store/cart"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            <ShoppingCartIcon className="size-4" aria-hidden />
            السلة
          </Link>
        </nav>
      </header>
      <div className="mx-auto max-w-7xl px-4">
        <main className="py-6">{children}</main>
        <footer className="border-t py-6 text-center text-sm text-muted-foreground">
          متجر نكسا ريتيل © {new Date().getFullYear()} — الدفع عند الاستلام
        </footer>
      </div>
    </div>
  );
}
