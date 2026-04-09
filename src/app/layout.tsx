import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "note-auto | X × note 自動化ダッシュボード",
  description: "X × note 自動化 SaaS ダッシュボード",
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
