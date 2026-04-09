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
      <div className="flex justify-end">
        <button
          onClick={() => {
            setEditingAccount(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          アカウント追加
        </button>
      </div>

      {/* Account cards */}
      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-900">
          <p className="text-gray-500 dark:text-gray-400">
            アカウントがまだありません。追加してください。
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {account.name}
                  </h3>
                  <p className="mt-0.5 text-sm text-gray-500">
                    @{account.x_username}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    account.is_active
                      ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {account.is_active ? "稼働中" : "停止中"}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                <p>ジャンル: {genreLabel(account.genre_id)}</p>
                <p>投稿間隔: {account.post_interval_minutes}分</p>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                <button
                  onClick={() => handleToggle(account)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    account.is_active
                      ? "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      : "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                  }`}
                >
                  {account.is_active ? "停止" : "開始"}
                </button>
                <button
                  onClick={() => {
                    setEditingAccount(account);
                    setShowForm(true);
                  }}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              {editingAccount ? "アカウント編集" : "アカウント追加"}
            </h2>
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
      )}
    </>
  );
}
