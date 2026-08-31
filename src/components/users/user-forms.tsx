"use client";

import { useState, useTransition } from "react";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  createUserSchema,
  updateUserSchema,
} from "@/lib/validations/identity";
import { createUserAction, updateUserAction } from "@/actions/user-actions";
import type { UserDto } from "@/services/identity.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface RoleOption {
  id: string;
  name: string;
  label: string;
  permissions: string[];
  system: boolean;
}

interface FormProps {
  roles: RoleOption[];
  onSuccess: () => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p id="field-error" className="text-xs text-destructive" role="alert">
      {message}
    </p>
  );
}

const createResolver = zodResolver(createUserSchema) as unknown as Resolver<CreateFormValues>;

interface CreateFormValues {
  username: string;
  name: string;
  password: string;
  roleId: string;
  active: boolean;
}

export function CreateUserForm({ roles, onSuccess }: FormProps) {
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: createResolver,
    defaultValues: {
      username: "",
      name: "",
      password: "",
      roleId: roles[0]?.id ?? "",
      active: true,
    },
  });

  const onSubmit = handleSubmit((values) => {
    setActionError(undefined);
    startTransition(async () => {
      const result = await createUserAction(values);
      if (result.success) {
        toast.success("تم إنشاء المستخدم بنجاح");
        onSuccess();
      } else {
        setActionError(result.error);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {actionError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="username">اسم المستخدم</Label>
        <Input
          id="username"
          autoComplete="off"
          aria-invalid={!!errors.username}
          aria-describedby={errors.username ? "field-error" : undefined}
          {...register("username")}
        />
        {errors.username ? <FieldError message={errors.username.message} /> : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="name">الاسم</Label>
        <Input
          id="name"
          autoComplete="off"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "field-error" : undefined}
          {...register("name")}
        />
        {errors.name ? <FieldError message={errors.name.message} /> : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="password">كلمة المرور</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "field-error" : undefined}
          {...register("password")}
        />
        {errors.password ? <FieldError message={errors.password.message} /> : null}
      </div>

      <div className="grid gap-1.5">
        <Label>الدور</Label>
        <Controller
          control={control}
          name="roleId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full" aria-invalid={!!errors.roleId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.roleId ? <FieldError message={errors.roleId.message} /> : null}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
        <Label htmlFor="active" className="cursor-pointer">
          حساب نشط
        </Label>
        <Controller
          control={control}
          name="active"
          render={({ field }) => (
            <Switch
              id="active"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          إنشاء المستخدم
        </Button>
      </div>
    </form>
  );
}

const updateResolver = zodResolver(updateUserSchema) as unknown as Resolver<EditFormValues>;

interface EditFormValues {
  name: string;
  roleId: string;
  active: boolean;
  newPassword?: string;
}

export function EditUserForm({
  user,
  roles,
  onSuccess,
}: FormProps & { user: UserDto }) {
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
  } = useForm<EditFormValues>({
    resolver: updateResolver,
    defaultValues: {
      name: user.name,
      roleId: user.roleId,
      active: user.active,
      newPassword: "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    setActionError(undefined);
    startTransition(async () => {
      const result = await updateUserAction(user.id, values);
      if (result.success) {
        toast.success("تم تحديث المستخدم بنجاح");
        reset();
        onSuccess();
      } else {
        setActionError(result.error);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {actionError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label>اسم المستخدم</Label>
        <Input value={user.username} readOnly dir="ltr" disabled />
        <p className="text-xs text-muted-foreground">لا يمكن تغيير اسم المستخدم</p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="edit-name">الاسم</Label>
        <Input
          id="edit-name"
          autoComplete="off"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "field-error" : undefined}
          {...register("name")}
        />
        {errors.name ? <FieldError message={errors.name.message} /> : null}
      </div>

      <div className="grid gap-1.5">
        <Label>الدور</Label>
        <Controller
          control={control}
          name="roleId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full" aria-invalid={!!errors.roleId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.roleId ? <FieldError message={errors.roleId.message} /> : null}
      </div>

      {user.isOwner ? null : (
        <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
          <Label htmlFor="edit-active" className="cursor-pointer">
            حساب نشط
          </Label>
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <Switch
                id="edit-active"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="edit-password">كلمة مرور جديدة (اختياري)</Label>
        <Input
          id="edit-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.newPassword}
          aria-describedby={errors.newPassword ? "field-error" : undefined}
          {...register("newPassword")}
        />
        {errors.newPassword ? <FieldError message={errors.newPassword.message} /> : null}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          حفظ التغييرات
        </Button>
      </div>
    </form>
  );
}
