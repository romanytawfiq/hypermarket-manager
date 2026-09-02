"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { onlineCheckoutSchema } from "@/lib/validations/online-store";
import { createOnlineOrderAction } from "@/actions/online-store-actions";
import { useCartStore, type CartLine } from "@/store/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatEgp } from "@/lib/format";

const resolver = zodResolver(onlineCheckoutSchema) as unknown as Resolver<CheckoutValues>;

interface CheckoutValues {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: {
    fullName: string;
    phone: string;
    city: string;
    area: string;
    street: string;
    landmark?: string;
    notes?: string;
  };
}

type PaymentMethod = "COD" | "ONLINE";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

export function CheckoutForm({
  lines,
  subtotal,
  onlinePaymentAvailable,
}: {
  lines: CartLine[];
  subtotal: number;
  onlinePaymentAvailable: boolean;
}) {
  const [actionError, setActionError] = useState<string>();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [pending, startTransition] = useTransition();
  const clear = useCartStore((s) => s.clear);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutValues>({
    resolver,
    defaultValues: {
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      deliveryAddress: {
        fullName: "",
        phone: "",
        city: "",
        area: "",
        street: "",
        landmark: "",
        notes: "",
      },
    },
  });

  const onSubmit = handleSubmit((values) => {
    setActionError(undefined);
    startTransition(async () => {
      const result = await createOnlineOrderAction({
        customerName: values.customerName,
        customerEmail: values.customerEmail,
        customerPhone: values.customerPhone,
        deliveryAddress: {
          fullName: values.deliveryAddress.fullName,
          phone: values.deliveryAddress.phone,
          city: values.deliveryAddress.city,
          area: values.deliveryAddress.area,
          street: values.deliveryAddress.street,
          landmark: values.deliveryAddress.landmark ?? "",
          notes: values.deliveryAddress.notes ?? "",
        },
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        paymentMethod,
        idempotencyKey: crypto.randomUUID(),
      });

      if (result.order && result.paymentSessionUrl) {
        // Online payment: keep the tracking secret in sessionStorage so the
        // Kashier redirect return page can link back to tracking. The cart is
        // cleared only after payment is actually confirmed.
        sessionStorage.setItem(
          "nexa-pending-online",
          JSON.stringify({
            orderNumber: result.order.orderNumber,
            token: result.trackingToken ?? "",
          }),
        );
        window.location.assign(result.paymentSessionUrl);
        return;
      }

      if (result.order) {
        // Order persisted. For COD this is success; for ONLINE it means the
        // electronic payment session could not be initialized (the order stays
        // unpaid — no fabricated payment success).
        clear();
        const token = result.trackingToken ?? "";
        if (paymentMethod === "ONLINE") {
          setActionError(
            "تم تسجيل طلبك، لكن تعذّر إنشاء جلسة الدفع الإلكتروني. أكمل دفعك لاحقًا أو تواصل مع المتجر.",
          );
          return;
        }
        router.push(`/store/track?orderNumber=${encodeURIComponent(result.order.orderNumber)}&token=${encodeURIComponent(token)}`);
        return;
      }

      setActionError(result.error ?? "حدث خطأ غير متوقع");
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {actionError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      <section className="rounded-lg border bg-background p-4 space-y-3">
        <h2 className="font-heading text-sm font-bold">بيانات التوصيل</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="customerName">الاسم الكامل</Label>
            <Input id="customerName" aria-invalid={!!errors.customerName} {...register("customerName")} />
            <FieldError message={errors.customerName?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="customerPhone">رقم الهاتف</Label>
            <Input id="customerPhone" dir="ltr" aria-invalid={!!errors.customerPhone} {...register("customerPhone")} />
            <FieldError message={errors.customerPhone?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="customerEmail">البريد الإلكتروني (اختياري)</Label>
            <Input id="customerEmail" dir="ltr" aria-invalid={!!errors.customerEmail} {...register("customerEmail")} />
            <FieldError message={errors.customerEmail?.message} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-background p-4 space-y-3">
        <h2 className="font-heading text-sm font-bold">العنوان</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="addrFullName">اسم المستلم</Label>
            <Input id="addrFullName" aria-invalid={!!errors.deliveryAddress?.fullName} {...register("deliveryAddress.fullName")} />
            <FieldError message={errors.deliveryAddress?.fullName?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="addrPhone">هاتف المستلم</Label>
            <Input id="addrPhone" dir="ltr" aria-invalid={!!errors.deliveryAddress?.phone} {...register("deliveryAddress.phone")} />
            <FieldError message={errors.deliveryAddress?.phone?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="city">المدينة</Label>
            <Input id="city" aria-invalid={!!errors.deliveryAddress?.city} {...register("deliveryAddress.city")} />
            <FieldError message={errors.deliveryAddress?.city?.message} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="area">المنطقة</Label>
            <Input id="area" aria-invalid={!!errors.deliveryAddress?.area} {...register("deliveryAddress.area")} />
            <FieldError message={errors.deliveryAddress?.area?.message} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="street">الشارع</Label>
            <Input id="street" aria-invalid={!!errors.deliveryAddress?.street} {...register("deliveryAddress.street")} />
            <FieldError message={errors.deliveryAddress?.street?.message} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="landmark">معلم قريب (اختياري)</Label>
            <Input id="landmark" aria-invalid={!!errors.deliveryAddress?.landmark} {...register("deliveryAddress.landmark")} />
            <FieldError message={errors.deliveryAddress?.landmark?.message} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">ملاحظات (اختياري)</Label>
            <Textarea id="notes" rows={3} aria-invalid={!!errors.deliveryAddress?.notes} {...register("deliveryAddress.notes")} />
            <FieldError message={errors.deliveryAddress?.notes?.message} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-background p-4 space-y-3">
        <h2 className="font-heading text-sm font-bold">الدفع</h2>
        <div role="radiogroup" aria-label="طريقة الدفع" className="space-y-2">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
              paymentMethod === "COD" ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="COD"
              checked={paymentMethod === "COD"}
              onChange={() => setPaymentMethod("COD")}
              className="mt-0.5 size-4 text-primary"
            />
            <span>
              <span className="block text-sm font-medium">الدفع عند الاستلام</span>
              <span className="block text-xs text-muted-foreground">
                ادفع نقدًا عند استلام طلبك.
              </span>
            </span>
          </label>

          {onlinePaymentAvailable ? (
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                paymentMethod === "ONLINE" ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="ONLINE"
                checked={paymentMethod === "ONLINE"}
                onChange={() => setPaymentMethod("ONLINE")}
                className="mt-0.5 size-4 text-primary"
              />
              <span>
                <span className="block text-sm font-medium">الدفع الإلكتروني عبر كاشير</span>
                <span className="block text-xs text-muted-foreground">
                  سيتم تحويلك إلى صفحة الدفع الآمنة التابعة لكاشير لإكمال الدفع عبر البطاقة أو أي وسيلة متاحة.
                </span>
              </span>
            </label>
          ) : (
            <p className="rounded-lg border border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground" role="note">
              الدفع الإلكتروني غير متاح حاليًا. يتوفر الدفع عند الاستلام.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-2">
          <span className="font-semibold">الإجمالي المتوقع</span>
          <span className="text-lg font-bold text-primary">{formatEgp(subtotal)}</span>
        </div>
      </section>

      <Button type="submit" className="w-full" disabled={pending} size="lg">
        {pending ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
        {paymentMethod === "ONLINE" ? "المتابعة إلى الدفع الإلكتروني" : "تأكيد الطلب"}
      </Button>
      <Link href="/store/cart" className="block text-center text-sm text-muted-foreground hover:text-foreground">
        العودة إلى السلة
      </Link>
    </form>
  );
}
