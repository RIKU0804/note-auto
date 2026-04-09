"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/accounts", label: "アカウント管理", icon: Users },
  { href: "/posts", label: "投稿一覧", icon: FileText },
  { href: "/settings", label: "設定", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#fafafa]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-white/80 backdrop-blur-xl border-r border-[#e5e5e7]/60 transition-transform duration-300 ease-out lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex h-[72px] items-center justify-between px-7">
          <Link
            href="/dashboard"
            className="text-[19px] font-semibold tracking-tight text-[#1d1d1f]"
          >
            note-auto
          </Link>
          <button
            className="rounded-lg p-1.5 text-[#86868b] transition-colors hover:bg-[#f5f5f7] lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 pt-2">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`group relative flex items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-[#f5f5f7] text-[#1d1d1f]"
                      : "text-[#86868b] hover:bg-[#f5f5f7]/60 hover:text-[#1d1d1f]"
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[#0071e3]" />
                  )}
                  <item.icon
                    className={`h-[18px] w-[18px] ${
                      isActive ? "text-[#0071e3]" : "text-[#86868b] group-hover:text-[#6e6e73]"
                    }`}
                    strokeWidth={1.8}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User / Logout */}
        <div className="border-t border-[#e5e5e7]/60 px-4 py-5">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-medium text-[#86868b] transition-all duration-200 hover:bg-[#f5f5f7]/60 hover:text-[#1d1d1f]"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
            ログアウト
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-[56px] items-center border-b border-[#e5e5e7]/60 bg-white/80 backdrop-blur-xl px-5 lg:hidden">
          <button
            className="rounded-lg p-2 text-[#86868b] transition-colors hover:bg-[#f5f5f7]"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-3 text-[17px] font-semibold tracking-tight text-[#1d1d1f]">
            note-auto
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-6 py-10 sm:px-8 lg:px-12 lg:py-12">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
