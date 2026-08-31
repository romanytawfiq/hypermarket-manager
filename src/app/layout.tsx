import type { Metadata } from "next";
import { Noto_Sans_Arabic, Noto_Kufi_Arabic } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
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

export const metadata: Metadata = {
  title: "نكسا ريتيل",
  description: "منصة إدارة التجزئة والكافيه",
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
