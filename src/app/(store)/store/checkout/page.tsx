"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCartStore, cartSubtotal } from "@/store/cart";
import { CheckoutForm } from "@/components/store/checkout-form";
import { onlinePaymentAvailableAction } from "@/actions/online-store-actions";

export default function CheckoutPage() {
  const lines = useCartStore((s) => s.lines);
  const subtotal = cartSubtotal(lines);
  const [onlinePaymentAvailable, setOnlinePaymentAvailable] = useState(false);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    onlinePaymentAvailableAction().then((v) => {
      if (active) {
        setOnlinePaymentAvailable(v);
        setAvailabilityLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/40 p-8 text-center">
        <p className="text-sm text-muted-foreground">سلتك فارغة. أضف منتجات قبل إتمام الطلب.</p>
        <Link href="/store" className="mt-3 inline-block text-sm text-primary underline">
          تصفّح المنتجات
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-bold">إتمام الطلب</h1>
      <CheckoutForm
        lines={lines}
        subtotal={subtotal}
        onlinePaymentAvailable={onlinePaymentAvailable && availabilityLoaded}
      />
    </div>
  );
}
