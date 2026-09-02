import Link from "next/link";
import type { Metadata } from "next";
import {
  searchOnlineProducts,
  getOnlineCategories,
} from "@/services/online-store.service";
import { formatEgp } from "@/lib/format";
import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { BrandBadge } from "@/components/store/brand-badge";

export const metadata: Metadata = {
  title: "المنتجات — متجر نكسا ريتيل",
};

interface StorePageSearchParams {
  search?: string;
  category?: string;
  page?: string;
}

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/**
 * Public store product grid (Phase 9.2). Server-side search, category filter and
 * pagination keep queries bounded — the full catalog is never loaded into the
 * browser. The server is authoritative for prices, availability and stock.
 */
export default async function StoreHomePage({
  searchParams,
}: {
  searchParams: Promise<StorePageSearchParams>;
}) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const categoryId = typeof params.category === "string" ? params.category : "";
  const search = typeof params.search === "string" ? params.search : "";

  const [result, categories] = await Promise.all([
    searchOnlineProducts({ search, categoryId: categoryId || undefined, page }),
    getOnlineCategories(),
  ]);

  const { items, total, totalPages } = result;

  function pageHref(targetPage: number): string {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (categoryId) q.set("category", categoryId);
    q.set("page", String(targetPage));
    return `/store?${q.toString()}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">تسوق من المتجر</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            اختَر منتجاتك وأكمل الطلب بالدفع عند الاستلام أو الدفع الإلكتروني.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{total} منتج</span>
      </div>

      <form action="/store" method="get" className="flex gap-2" role="search">
        <label htmlFor="storeSearch" className="sr-only">
          ابحث عن منتج
        </label>
        <input
          id="storeSearch"
          name="search"
          defaultValue={search}
          placeholder="ابحث عن منتج…"
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {categoryId ? <input type="hidden" name="category" value={categoryId} /> : null}
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          بحث
        </button>
      </form>

      {categories.length > 0 ? (
        <nav className="flex flex-wrap gap-2" aria-label="تصفية حسب الفئة">
          <Link
            href="/store"
            className={`rounded-full border px-3 py-1 text-xs ${
              categoryId
                ? "border-border text-muted-foreground hover:bg-muted"
                : "border-primary bg-primary/10 font-medium text-primary"
            }`}
          >
            الكل
          </Link>
          {categories.map((c) => {
            const q = new URLSearchParams();
            if (search) q.set("search", search);
            q.set("category", c.id);
            return (
              <Link
                key={c.id}
                href={`/store?${q.toString()}`}
                className={`rounded-full border px-3 py-1 text-xs ${
                  categoryId === c.id
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-lg border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          {search || categoryId
            ? "لا توجد منتجات تطابق البحث."
            : "لا توجد منتجات متاحة في المتجر حاليًا."}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md lg:grid-cols-5">
          {items.map((p) => (
            <li key={p.id} className="rounded-lg border bg-background p-3">
              {p.brandName ? (
                <div className="mb-1.5">
                  <BrandBadge name={p.brandName} logo={p.brandLogo} />
                </div>
              ) : null}
              <Link
                href={`/store/products/${p.id}`}
                className="block font-medium leading-snug hover:underline"
              >
                {p.name}
              </Link>
              {p.categoryName ? (
                <p className="mt-0.5 text-xs text-muted-foreground" dir="rtl">
                  {p.categoryName}
                </p>
              ) : null}
              <p className="mt-2 text-sm font-semibold text-primary">
                {formatEgp(p.sellingPrice)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {p.inStock ? `متاح: ${p.available} ${p.unit}` : "غير متوفر حاليًا"}
              </p>
              <div className="mt-2">
                <AddToCartButton product={p} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav
          className="flex items-center justify-center gap-2"
          aria-label="صفحات المنتجات"
        >
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              السابق
            </Link>
          ) : null}
          <span className="px-2 text-sm text-muted-foreground">
            صفحة {page} من {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              التالي
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
