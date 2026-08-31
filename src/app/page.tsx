import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="container mx-auto flex min-h-svh max-w-3xl flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <p className="text-sm font-medium text-accent">نكسا ريتيل</p>
        <h1 className="mt-2 font-heading text-2xl font-bold">منصة إدارة التجزئة والكافيه</h1>
        <p className="mt-3 text-muted-foreground">
          المرحلة الحالية: التأسيس والهندسة. تعمل الواجهات التشغيلية بنظام من اليمين إلى اليسار.
        </p>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-heading text-lg">حالة المشروع</CardTitle>
          <CardDescription>
            تُبنى منصة نكسا ريتيل على أساس عربي بالكامل (ar-EG) وباتجاه RTL منذ البداية. تُضاف الأقسام
            الوظيفية تباعًا حسب خارطة الطريق الموثّقة في docs/architecture.md.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
