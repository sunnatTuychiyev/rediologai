import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const manrope = Manrope({ subsets: ["latin", "latin-ext"], weight: ["700", "800"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "RadiologAI — Ta'lim",
  description: "Radiologik xulosa yozishni AI yordamida o'rganish platformasi",
  icons: { icon: "/brand/logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={`${inter.variable} ${manrope.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
