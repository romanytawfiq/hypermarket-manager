"use client";

import { useState } from "react";
import { ShoppingCartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OnlineProductDto } from "@/services/online-store.service";
import { useCartStore } from "@/store/cart";

/**
 * Adds a product to the guest cart (client UX only). The cart holds display
 * price for UX; the server recomputes and revalidates everything at checkout.
 */
export function AddToCartButton({ product }: { product: OnlineProductDto }) {
  const add = useCartStore((s) => s.add);
  const [added, setAdded] = useState(false);

  if (!product.inStock) {
    return (
      <Button variant="outline" disabled className="w-full">
        غير متوفر
      </Button>
    );
  }

  return (
    <Button
      variant={added ? "secondary" : "default"}
      className="w-full"
      onClick={() => {
        add({
          productId: product.id,
          name: product.name,
          unitPrice: product.sellingPrice,
          unit: product.unit,
          available: product.available,
        });
        setAdded(true);
        setTimeout(() => setAdded(false), 1500);
      }}
    >
      <ShoppingCartIcon className="size-4" aria-hidden />
      {added ? "أُضيف إلى السلة" : "أضف إلى السلة"}
    </Button>
  );
}