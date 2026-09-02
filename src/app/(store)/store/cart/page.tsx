"use client";

import Link from "next/link";
import { useCartStore, cartSubtotal } from "@/store/cart";
import { formatEgp } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { TrashIcon, MinusIcon, PlusIcon } from "lucide-react";

export default function CartPage() {
  const lines = useCartStore((s) => s.lines);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);

  const subtotal = cartSubtotal(lines);

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/40 p-8 text-center">
        <p className="text-sm text-muted-foreground">سلتك فارغة حاليًا.</p>
        <Link href="/store" className="mt-3 inline-block text-sm text-primary underline">
          تصفّح المنتجات
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-bold">سلة التسوق</h1>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.productId} className="rounded-lg border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/store/products/${line.productId}`}
                className="font-medium hover:underline"
              >
                {line.name}
              </Link>
              <button
                type="button"
                onClick={() => remove(line.productId)}
                aria-label={`حذف ${line.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <TrashIcon className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" onClick={() => setQuantity(line.productId, line.quantity - 1)} aria-label="إنقاص">
                  <MinusIcon className="size-3" aria-hidden />
                </Button>
                <span className="min-w-6 text-center font-medium">{line.quantity}</span>
                <Button variant="outline" size="icon-xs" onClick={() => setQuantity(line.productId, line.quantity + 1)} aria-label="زيادة">
                  <PlusIcon className="size-3" aria-hidden />
                </Button>
              </div>
              <span className="font-semibold">{formatEgp(line.quantity * line.unitPrice)}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-lg border bg-background p-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">الإجمالي (تقديري)</span>
          <span className="text-lg font-bold text-primary">{formatEgp(subtotal)}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          يُحتسب السعر النهائي عند إتمام الطلب.
        </p>
        <Link href="/store/checkout" className="mt-3 block">
          <Button className="w-full">إتمام الطلب</Button>
        </Link>
        <Link href="/store" className="mt-2 block text-center text-sm text-primary underline">
          متابعة التسوق
        </Link>
      </div>
    </div>
  );
}