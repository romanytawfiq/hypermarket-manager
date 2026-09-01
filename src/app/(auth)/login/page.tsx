import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "تسجيل الدخول — نكسا ريتيل",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already authenticated → skip the login screen.
  const user = await getCurrentUser();
  if (user) {
    redirect("/");
  }

  const { next } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-sm font-medium text-accent">نكسا ريتيل</p>
          <h1 className="mt-1 font-heading text-xl font-bold">منصة إدارة التجزئة والكافيه</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">تسجيل الدخول</CardTitle>
            <CardDescription>
              أدخل اسم المستخدم وكلمة المرور للوصول إلى النظام
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={next} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
