import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "日本 Costco 精選購物",
  description: "日本 Costco 特色商品搜尋與獨立購物系統"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 bg-brand text-white shadow">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <a href="/costco" className="text-lg font-extrabold">🛒 日本 Costco</a>
            <a href="/costco/cart" className="font-bold">購物車</a>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 pb-20 pt-4">{children}</main>
      </body>
    </html>
  );
}
