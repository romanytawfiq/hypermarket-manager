"use client";

import { useState, useTransition } from "react";
import { useForm, Controller, type Control, type FieldErrors, type Resolver, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  productCreateSchema,
  productUpdateSchema,
} from "@/lib/validations/catalog";
import {
  createProductAction,
  updateProductAction,
} from "@/actions/catalog-actions";
import type { ProductDto, CategoryDto, BrandDto } from "@/services/catalog.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Option {
  id: string;
  name: string;
}

interface ProductFormProps {
  categories: CategoryDto[] | Option[];
  brands: BrandDto[] | Option[];
  onSuccess: () => void;
}

interface ProductFormValues {
  name: string;
  barcode: string;
  sku: string;
  categoryId: string;
  brandId: string;
  unit: string;
  purchaseCost: string;
  sellingPrice: string;
  minimumStock: string;
  trackExpiry: boolean;
  onlineVisible: boolean;
  description: string;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

function CategoryField({
  control,
  categories,
}: {
  control: Control<ProductFormValues>;
  categories: Option[];
}) {
  return (
    <div className="grid gap-1.5">
      <Label>الفئة *</Label>
      <Controller
        control={control}
        name="categoryId"
        render={({ field }) => (
          <Select value={field.value || ""} onValueChange={field.onChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="اختر الفئة" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}

function BrandField({
  control,
  brands,
}: {
  control: Control<ProductFormValues>;
  brands: Option[];
}) {
  return (
    <div className="grid gap-1.5">
      <Label>العلامة التجارية (اختياري)</Label>
      <Controller
        control={control}
        name="brandId"
        render={({ field }) => (
          <Select value={field.value || ""} onValueChange={field.onChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="بدون علامة تجارية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">بدون علامة تجارية</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}

const createResolver = zodResolver(productCreateSchema) as unknown as Resolver<ProductFormValues>;

export function CreateProductForm({
  categories,
  brands,
  onSuccess,
}: ProductFormProps) {
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: createResolver,
    defaultValues: {
      name: "",
      barcode: "",
      sku: "",
      categoryId: "",
      brandId: "",
      unit: "قطعة",
      purchaseCost: "0",
      sellingPrice: "0",
      minimumStock: "0",
      trackExpiry: false,
      onlineVisible: false,
      description: "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    setActionError(undefined);
    startTransition(async () => {
      const result = await createProductAction({
        name: values.name,
        barcode: values.barcode || undefined,
        sku: values.sku || undefined,
        categoryId: values.categoryId,
        brandId: values.brandId || undefined,
        unit: values.unit,
        purchaseCost: Number(values.purchaseCost) || 0,
        sellingPrice: Number(values.sellingPrice) || 0,
        minimumStock: Number(values.minimumStock) || 0,
        trackExpiry: values.trackExpiry,
        onlineVisible: values.onlineVisible,
        description: values.description || undefined,
        active: true,
      });
      if (result.success) {
        toast.success("تم إنشاء المنتج بنجاح");
        reset();
        onSuccess();
      } else if (result.error) {
        setActionError(result.error);
      }
    });
  });

  return (
    <ProductFormFields
      onSubmit={onSubmit}
      register={register}
      control={control}
      errors={errors}
      pending={pending}
      actionError={actionError}
      categories={categories}
      brands={brands}
      submitLabel="إنشاء المنتج"
    />
  );
}

const updateResolver = zodResolver(productUpdateSchema) as unknown as Resolver<ProductFormValues>;

export function EditProductForm({
  product,
  categories,
  brands,
  onSuccess,
}: ProductFormProps & { product: ProductDto }) {
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: updateResolver,
    defaultValues: {
      name: product.name,
      barcode: product.barcode ?? "",
      sku: product.sku ?? "",
      categoryId: product.categoryId,
      brandId: product.brandId ?? "",
      unit: product.unit,
      purchaseCost: String(product.purchaseCost),
      sellingPrice: String(product.sellingPrice),
      minimumStock: String(product.minimumStock),
      trackExpiry: product.trackExpiry,
      onlineVisible: product.onlineVisible,
      description: product.description ?? "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    setActionError(undefined);
    startTransition(async () => {
      const result = await updateProductAction(product.id, {
        name: values.name,
        barcode: values.barcode || undefined,
        sku: values.sku || undefined,
        categoryId: values.categoryId,
        brandId: values.brandId || undefined,
        unit: values.unit,
        purchaseCost: Number(values.purchaseCost) || 0,
        sellingPrice: Number(values.sellingPrice) || 0,
        minimumStock: Number(values.minimumStock) || 0,
        trackExpiry: values.trackExpiry,
        onlineVisible: values.onlineVisible,
        description: values.description || undefined,
      });
      if (result.success) {
        toast.success("تم تحديث المنتج بنجاح");
        reset();
        onSuccess();
      } else if (result.error) {
        setActionError(result.error);
      }
    });
  });

  return (
    <ProductFormFields
      onSubmit={onSubmit}
      register={register}
      control={control}
      errors={errors}
      pending={pending}
      actionError={actionError}
      categories={categories}
      brands={brands}
      submitLabel="حفظ التغييرات"
    />
  );
}

function ProductFormFields({
  onSubmit,
  register,
  control,
  errors,
  pending,
  actionError,
  categories,
  brands,
  submitLabel,
}: {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  register: UseFormRegister<ProductFormValues>;
  control: Control<ProductFormValues>;
  errors: FieldErrors<ProductFormValues>;
  pending: boolean;
  actionError?: string;
  categories: Option[];
  brands: Option[];
  submitLabel: string;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {actionError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="product-name">اسم المنتج *</Label>
        <Input id="product-name" aria-invalid={!!errors.name} aria-describedby={errors.name ? "field-error" : undefined} {...register("name")} />
        {errors.name ? <FieldError message={errors.name.message} /> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="product-barcode">الباركود</Label>
          <Input id="product-barcode" dir="ltr" className="text-start" placeholder="رمز EAN" {...register("barcode")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="product-sku">رمز SKU</Label>
          <Input id="product-sku" dir="ltr" className="text-start" placeholder="الرمز الداخلي" {...register("sku")} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CategoryField control={control} categories={categories} />
        <BrandField control={control} brands={brands} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="product-unit">الوحدة *</Label>
        <Input id="product-unit" {...register("unit")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="product-cost">تكلفة الشراء</Label>
          <Input id="product-cost" type="number" min="0" step="0.01" {...register("purchaseCost")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="product-price">سعر البيع *</Label>
          <Input id="product-price" type="number" min="0" step="0.01" aria-invalid={!!errors.sellingPrice} {...register("sellingPrice")} />
          {errors.sellingPrice ? <FieldError message={errors.sellingPrice.message} /> : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="product-min">الحد الأدنى للمخزون</Label>
          <Input id="product-min" type="number" min="0" step="1" {...register("minimumStock")} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="product-desc">الوصف (اختياري)</Label>
        <Textarea id="product-desc" rows={3} {...register("description")} />
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
          <Label htmlFor="track-expiry" className="cursor-pointer">
            تتبع انتهاء الصلاحية (دفعات)
          </Label>
          <Controller
            control={control}
            name="trackExpiry"
            render={({ field }) => (
              <Switch id="track-expiry" checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
          <Label htmlFor="online-visible" className="cursor-pointer">
            الظهور في المتجر الإلكتروني
          </Label>
          <Controller
            control={control}
            name="onlineVisible"
            render={({ field }) => (
              <Switch id="online-visible" checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
