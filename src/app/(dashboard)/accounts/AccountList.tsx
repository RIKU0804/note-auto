"use client";

import { useEffect, useRef, useState } from "react";
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
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const editButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const deleteButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);

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

  const requestDelete = (account: Account) => {
    lastTriggerRef.current =
      deleteButtonRefs.current.get(account.id) ?? null;
    setDeleteTarget(account);
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
    lastTriggerRef.current?.focus();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    }
    setDeleteTarget(null);
    lastTriggerRef.current?.focus();
  };

  const openAdd = () => {
    lastTriggerRef.current = addButtonRef.current;
    setEditingAccount(null);
    setShowForm(true);
  };

  const openEdit = (account: Account) => {
    lastTriggerRef.current =
      editButtonRefs.current.get(account.id) ?? null;
    setEditingAccount(account);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingAccount(null);
    lastTriggerRef.current?.focus();
  };

  const handleSave = () => {
    setShowForm(false);
    setEditingAccount(null);
    lastTriggerRef.current?.focus();
    router.refresh();
  };

  // Focus first input in edit/add modal and handle Escape
  useEffect(() => {
    if (!showForm) return;
    const container = modalRef.current;
    if (container) {
      const firstInput = container.querySelector<HTMLElement>(
        "input, select, textarea, button"
      );
      firstInput?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeForm();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  // Focus cancel button on delete modal and handle Escape
  useEffect(() => {
    if (!deleteTarget) return;
    deleteCancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelDelete();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteTarget]);

  const genreLabel = (id: string) =>
    genres.find((g) => g.id === id)?.label ?? id;

  return (
    <>
      <div className="flex justify-end">
        <button
          ref={addButtonRef}
          onClick={openAdd}
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
          <p style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
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
                  <p className="mt-0.5 text-sm" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
                    @{account.x_username}
                  </p>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    borderRadius: '9999px',
                    background: account.is_active ? 'rgba(31, 138, 101, 0.1)' : 'rgba(38, 37, 30, 0.06)',
                    color: account.is_active ? '#1f8a65' : 'rgba(38, 37, 30, 0.72)',
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: account.is_active ? '#1f8a65' : 'rgba(38, 37, 30, 0.3)' }}
                  />
                  {account.is_active ? "稼働中" : "停止中"}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
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
                  ref={(el) => {
                    if (el) {
                      editButtonRefs.current.set(account.id, el);
                    } else {
                      editButtonRefs.current.delete(account.id);
                    }
                  }}
                  onClick={() => openEdit(account)}
                  aria-label={`「${account.name}」を編集`}
                  className="rounded-lg p-1.5 transition-colors"
                  style={{ color: 'rgba(38, 37, 30, 0.62)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#26251e'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(38, 37, 30, 0.62)'; }}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  ref={(el) => {
                    if (el) {
                      deleteButtonRefs.current.set(account.id, el);
                    } else {
                      deleteButtonRefs.current.delete(account.id);
                    }
                  }}
                  onClick={() => requestDelete(account)}
                  aria-label={`「${account.name}」を削除`}
                  className="rounded-lg p-1.5 transition-colors"
                  style={{ color: 'rgba(38, 37, 30, 0.62)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#cf2d56'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(38, 37, 30, 0.62)'; }}
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
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="w-full max-w-lg rounded-lg p-6"
            style={{
              background: '#f7f7f4',
              boxShadow: '0 28px 70px rgba(38, 37, 30, 0.12)',
              border: '1px solid rgba(38, 37, 30, 0.1)',
            }}
          >
            <h2
              id="modal-title"
              className="mb-4 text-lg font-semibold"
              style={{ color: '#26251e', letterSpacing: '-0.01em' }}
            >
              {editingAccount ? "アカウント編集" : "アカウント追加"}
            </h2>
            <AccountForm
              account={editingAccount}
              genres={genres}
              onSave={handleSave}
              onCancel={closeForm}
            />
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(38, 37, 30, 0.2)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelDelete();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            className="w-full max-w-sm rounded-lg p-6"
            style={{
              background: '#f7f7f4',
              boxShadow: '0 28px 70px rgba(38, 37, 30, 0.12)',
              border: '1px solid rgba(38, 37, 30, 0.1)',
            }}
          >
            <h2
              id="delete-modal-title"
              className="text-lg font-semibold"
              style={{ color: '#26251e', letterSpacing: '-0.01em' }}
            >
              アカウントを削除
            </h2>
            <p
              className="mt-2 text-sm"
              style={{ color: 'rgba(38, 37, 30, 0.72)' }}
            >
              「{deleteTarget.name}」を削除しますか？この操作は取り消せません。
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                ref={deleteCancelRef}
                type="button"
                onClick={cancelDelete}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  background: 'transparent',
                  color: 'rgba(38, 37, 30, 0.72)',
                  border: '1px solid rgba(38, 37, 30, 0.1)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#26251e'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(38, 37, 30, 0.72)'; }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  background: '#cf2d56',
                  color: '#f7f7f4',
                  border: '1px solid #cf2d56',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#b52449'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#cf2d56'; }}
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
