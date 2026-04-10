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
    <div className="flex h-screen overflow-hidden" style={{ background: '#f2f1ed' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(38, 37, 30, 0.2)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        id="primary-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: '#f7f7f4',
          borderRight: '1px solid rgba(38, 37, 30, 0.1)',
        }}
      >
        {/* Logo */}
        <div
          className="flex h-16 items-center justify-between px-6"
          style={{ borderBottom: '1px solid rgba(38, 37, 30, 0.1)' }}
        >
          <Link
            href="/dashboard"
            className="text-xl font-bold"
            style={{ color: '#26251e', letterSpacing: '-0.03em' }}
          >
            note-auto
          </Link>
          <button
            type="button"
            aria-label="サイドバーを閉じる"
            className="rounded-lg p-1 lg:hidden"
            style={{ color: 'rgba(38, 37, 30, 0.72)' }}
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
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
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors"
                style={{
                  borderRadius: '9999px',
                  color: isActive ? '#26251e' : 'rgba(38, 37, 30, 0.72)',
                  background: isActive ? '#ebeae5' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = '#26251e';
                    e.currentTarget.style.background = 'rgba(38, 37, 30, 0.04)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = 'rgba(38, 37, 30, 0.72)';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User / Logout */}
        <div className="p-4" style={{ borderTop: '1px solid rgba(38, 37, 30, 0.1)' }}>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors"
            style={{
              borderRadius: '9999px',
              color: 'rgba(38, 37, 30, 0.72)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#cf2d56';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(38, 37, 30, 0.72)';
            }}
          >
            <LogOut className="h-5 w-5" />
            ログアウト
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header
          className="flex h-16 items-center px-4 lg:hidden"
          style={{
            background: '#f7f7f4',
            borderBottom: '1px solid rgba(38, 37, 30, 0.1)',
          }}
        >
          <button
            type="button"
            aria-label="メニューを開く"
            aria-expanded={sidebarOpen}
            aria-controls="primary-sidebar"
            className="rounded-lg p-2"
            style={{ color: 'rgba(38, 37, 30, 0.72)' }}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <span
            className="ml-3 text-lg font-bold"
            style={{ color: '#26251e', letterSpacing: '-0.03em' }}
          >
            note-auto
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
