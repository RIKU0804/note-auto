"use client";

import { useState } from "react";
import type { Account } from "@/types/database";

type Genre = { id: string; label: string };

export default function AccountForm({
  account,
  genres,
  onSave,
  onCancel,
}: {
  account: Account | null;
  genres: Genre[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(account?.name ?? "");
  const [genreId, setGenreId] = useState(account?.genre_id ?? genres[0]?.id ?? "");
  const [noteEmail, setNoteEmail] = useState(account?.note_email ?? "");
  const [notePassword, setNotePassword] = useState("");
  const [xUsername, setXUsername] = useState(account?.x_username ?? "");
  const [xPassword, setXPassword] = useState("");
  const [postInterval, setPostInterval] = useState(
    account?.post_interval_minutes ?? 60
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const body: Record<string, unknown> = {
      name,
      genre_id: genreId,
      note_email: noteEmail,
      x_username: xUsername,
      post_interval_minutes: postInterval,
    };

    if (notePassword) body.note_password = notePassword;
    if (xPassword) body.x_password = xPassword;

    try {
      const url = account ? `/api/accounts/${account.id}` : "/api/accounts";
      const method = account ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "保存に失敗しました");
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          アカウント名
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 自己啓発アカウント"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          ジャンル
        </label>
        <select
          value={genreId}
          onChange={(e) => setGenreId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        >
          {genres.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            note メールアドレス
          </label>
          <input
            type="email"
            required
            value={noteEmail}
            onChange={(e) => setNoteEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            note パスワード
          </label>
          <input
            type="password"
            value={notePassword}
            onChange={(e) => setNotePassword(e.target.value)}
            placeholder={account ? "変更しない場合は空欄" : "••••••••"}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            X ユーザー名
          </label>
          <input
            type="text"
            required
            value={xUsername}
            onChange={(e) => setXUsername(e.target.value)}
            placeholder="@username"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            X パスワード
          </label>
          <input
            type="password"
            value={xPassword}
            onChange={(e) => setXPassword(e.target.value)}
            placeholder={account ? "変更しない場合は空欄" : "••••••••"}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          投稿間隔（分）
        </label>
        <input
          type="number"
          required
          min={1}
          value={postInterval}
          onChange={(e) => setPostInterval(Number(e.target.value))}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  );
}
