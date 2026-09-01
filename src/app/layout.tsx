import type { Metadata } from "next";
import { Noto_Sans_Arabic, Noto_Kufi_Arabic } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/lib/env";
import "./globals.css";

const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-noto-sans-arabic",
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const notoKufiArabic = Noto_Kufi_Arabic({
  variable: "--font-noto-kufi-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "نكسا ريتيل",
  description: "منصة إدارة التجزئة والكافيه — مبيعات، مخزون، محاسبة، وخدمة الكافيه في تطبيق واحد.",
  applicationName: "نكسا ريتيل",
  keywords: ["تجزئة", "كافيه", "إدارة مخزون", "نقطة بيع", "محاسبة"],
  openGraph: {
    type: "website",
    locale: "ar_EG",
    url: appUrl,
    siteName: "نكسا ريتيل",
    title: "نكسا ريتيل",
    description: "منصة إدارة التجزئة والكافيه — مبيعات، مخزون، محاسبة، وخدمة الكافيه في تطبيق واحد.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${notoSansArabic.variable} ${notoKufiArabic.variable}`}
    >
      <body>
        <DirectionProvider direction="rtl">
          {children}
          <Toaster richColors closeButton position="bottom-center" />
        </DirectionProvider>
      </body>
    </html>
  );
}
