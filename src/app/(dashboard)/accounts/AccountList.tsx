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
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors"
          style={{
            borderRadius: '9999px',
            background: '#ebeae5',
            color: '#26251e',
            border: '1px solid rgba(38, 37, 30, 0.1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#cf2d56'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#26251e'; }}
        >
          <Plus className="h-4 w-4" />
          アカウント追加
        </button>
      </div>

      {/* Account cards */}
      {accounts.length === 0 ? (
        <div
          className="rounded-lg p-12 text-center"
          style={{
            background: '#f7f7f4',
            border: '1px dashed rgba(38, 37, 30, 0.2)',
          }}
        >
          <p style={{ color: 'rgba(38, 37, 30, 0.55)' }}>
            アカウントがまだありません。追加してください。
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-lg p-5"
              style={{
                background: '#e6e5e0',
                border: '1px solid rgba(38, 37, 30, 0.1)',
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold" style={{ color: '#26251e' }}>
                    {account.name}
                  </h3>
                  <p className="mt-0.5 text-sm" style={{ color: 'rgba(38, 37, 30, 0.55)' }}>
                    @{account.x_username}
                  </p>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    borderRadius: '9999px',
                    background: account.is_active ? 'rgba(31, 138, 101, 0.1)' : 'rgba(38, 37, 30, 0.06)',
                    color: account.is_active ? '#1f8a65' : 'rgba(38, 37, 30, 0.55)',
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: account.is_active ? '#1f8a65' : 'rgba(38, 37, 30, 0.3)' }}
                  />
                  {account.is_active ? "稼働中" : "停止中"}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm" style={{ color: 'rgba(38, 37, 30, 0.55)' }}>
                <p>ジャンル: {genreLabel(account.genre_id)}</p>
                <p>投稿間隔: {account.post_interval_minutes}分</p>
              </div>

              <div
                className="mt-4 flex items-center gap-2 pt-4"
                style={{ borderTop: '1px solid rgba(38, 37, 30, 0.1)' }}
              >
                <button
                  onClick={() => handleToggle(account)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: account.is_active ? '#f2f1ed' : 'rgba(31, 138, 101, 0.1)',
                    color: account.is_active ? '#26251e' : '#1f8a65',
                    border: '1px solid rgba(38, 37, 30, 0.1)',
                  }}
                >
                  {account.is_active ? "停止" : "開始"}
                </button>
                <button
                  onClick={() => {
                    setEditingAccount(account);
                    setShowForm(true);
                  }}
                  className="rounded-lg p-1.5 transition-colors"
                  style={{ color: 'rgba(38, 37, 30, 0.4)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#26251e'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(38, 37, 30, 0.4)'; }}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="rounded-lg p-1.5 transition-colors"
                  style={{ color: 'rgba(38, 37, 30, 0.4)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#cf2d56'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(38, 37, 30, 0.4)'; }}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(38, 37, 30, 0.2)' }}
        >
          <div
            className="w-full max-w-lg rounded-lg p-6"
            style={{
              background: '#f7f7f4',
              boxShadow: '0 28px 70px rgba(38, 37, 30, 0.12)',
              border: '1px solid rgba(38, 37, 30, 0.1)',
            }}
          >
            <h2 className="mb-4 text-lg font-semibold" style={{ color: '#26251e', letterSpacing: '-0.01em' }}>
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
