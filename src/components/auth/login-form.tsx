"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { loginAction, type LoginState } from "@/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
      {pending ? "جارٍ تسجيل الدخول..." : "دخول"}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="grid gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="username">اسم المستخدم</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          inputMode="text"
          autoFocus
          required
          placeholder="اسم المستخدم"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="password">كلمة المرور</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="كلمة المرور"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
