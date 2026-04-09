"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Account } from "@/types/database";
import AccountForm from "./AccountForm";

type Genre = { id: string; label: string };

export default function AccountList({
  initialAccounts,
  genres,
}: {
  initialAccounts: Account[];
  genres: Genre[];
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const handleToggle = async (account: Account) => {
    const res = await fetch(`/api/accounts/${account.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !account.is_active }),
    });
    if (res.ok) {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === account.id ? { ...a, is_active: !a.is_active } : a
        )
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このアカウントを削除しますか？")) return;
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const handleSave = () => {
    setShowForm(false);
    setEditingAccount(null);
    router.refresh();
  };

  const genreLabel = (id: string) =>
    genres.find((g) => g.id === id)?.label ?? id;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight text-[#1d1d1f]">
            アカウント管理
          </h1>
          <p className="mt-1.5 text-[15px] text-[#86868b]">
            X / note アカウントの追加と管理
          </p>
        </div>
        <button
          onClick={() => {
            setEditingAccount(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-[#0071e3] px-5 py-2.5 text-[13px] font-medium text-white transition-all duration-200 hover:bg-[#0077ed] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          追加
        </button>
      </div>

      {/* Account cards */}
      {accounts.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#d1d1d6] bg-white p-16 text-center">
          <p className="text-[15px] text-[#86868b]">
            アカウントがまだありません。追加してください。
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="group rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/[0.04] transition-all duration-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[16px] font-semibold text-[#1d1d1f] truncate">
                    {account.name}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-[#aeaeb2]">
                    @{account.x_username}
                  </p>
                </div>
                <button
                  onClick={() => handleToggle(account)}
                  className={`toggle-switch flex-shrink-0 ${account.is_active ? "active" : ""}`}
                  aria-label={account.is_active ? "停止" : "開始"}
                />
              </div>

              <div className="mt-4 space-y-1.5">
                <p className="text-[13px] text-[#86868b]">
                  {genreLabel(account.genre_id)}
                </p>
                <p className="text-[13px] text-[#86868b]">
                  投稿間隔: {account.post_interval_minutes}分
                </p>
              </div>

              <div className="mt-5 flex items-center gap-1 border-t border-[#f5f5f7] pt-4">
                <button
                  onClick={() => {
                    setEditingAccount(account);
                    setShowForm(true);
                  }}
                  className="rounded-lg p-2 text-[#aeaeb2] transition-all duration-200 hover:bg-[#f5f5f7] hover:text-[#6e6e73]"
                  aria-label="編集"
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.8} />
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="rounded-lg p-2 text-[#aeaeb2] transition-all duration-200 hover:bg-[#fff0f0] hover:text-[#ff3b30]"
                  aria-label="削除"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl ring-1 ring-black/[0.06]">
            <h2 className="text-[20px] font-semibold text-[#1d1d1f]">
              {editingAccount ? "アカウント編集" : "アカウント追加"}
            </h2>
            <p className="mt-1 text-[13px] text-[#86868b]">
              {editingAccount
                ? "アカウント情報を更新します"
                : "新しいアカウントを追加します"}
            </p>
            <div className="mt-6">
              <AccountForm
                account={editingAccount}
                genres={genres}
                onSave={handleSave}
                onCancel={() => {
                  setShowForm(false);
                  setEditingAccount(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
