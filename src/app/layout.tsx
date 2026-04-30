import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "note-auto | X 自動投稿ダッシュボード",
  description: "X トレンド収集 + AI 投稿 SaaS ダッシュボード",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={inter.className}>
      <body className="min-h-screen antialiased" style={{ background: '#f2f1ed', color: '#26251e' }}>
        {children}
      </body>
    </html>
  );
}
