import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getOnlineProduct } from "@/services/online-store.service";
import { formatEgp } from "@/lib/format";
import { AddToCartButton } from "@/components/store/add-to-cart-button";
import { BrandBadge } from "@/components/store/brand-badge";

export const metadata: Metadata = {
  title: "المنتج — متجر نكسا ريتيل",
};

export default async function StoreProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getOnlineProduct(id);
  if (!product) notFound();

  return (
    <div className="space-y-4">
      <Link href="/store" className="text-sm text-muted-foreground hover:text-foreground">
        ← العودة للمنتجات
      </Link>
      <div className="rounded-lg border bg-background p-4">
        {product.brandName ? (
          <div className="mb-2">
            <BrandBadge name={product.brandName} logo={product.brandLogo} />
          </div>
        ) : null}
        <h1 className="font-heading text-xl font-bold">{product.name}</h1>
        {product.categoryName ? (
          <p className="mt-1 text-sm text-muted-foreground">{product.categoryName}</p>
        ) : null}
        <p className="mt-4 text-2xl font-bold text-primary">{formatEgp(product.sellingPrice)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {product.inStock ? `متاح: ${product.available} ${product.unit}` : "غير متوفر حاليًا"}
        </p>
        {product.description ? (
          <p className="mt-3 text-sm leading-relaxed text-foreground/80">{product.description}</p>
        ) : null}
        <div className="mt-5 max-w-xs">
          <AddToCartButton product={product} />
        </div>
      </div>
      <Link href="/store" className="text-sm text-muted-foreground hover:text-foreground">
        ← العودة للمنتجات
      </Link>
    </div>
  );
}