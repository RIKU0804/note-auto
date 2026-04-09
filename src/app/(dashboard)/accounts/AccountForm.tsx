"use client";

import { useState } from "react";
import type { Account } from "@/types/database";

type Genre = { id: string; label: string };

const inputClasses =
  "w-full rounded-xl border border-[#e5e5e7] bg-[#fafafa] px-4 py-3 text-[14px] text-[#1d1d1f] outline-none transition-all duration-200 placeholder:text-[#aeaeb2] focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/10";

const labelClasses =
  "block text-[12px] font-medium uppercase tracking-wider text-[#86868b] mb-1.5";

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
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl bg-[#fff0f0] px-4 py-3 text-[13px] text-[#ff3b30]">
          {error}
        </div>
      )}

      <div>
        <label className={labelClasses}>アカウント名</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 自己啓発アカウント"
          className={inputClasses}
        />
      </div>

      <div>
        <label className={labelClasses}>ジャンル</label>
        <input
          type="text"
          required
          value={genreId}
          onChange={(e) => setGenreId(e.target.value)}
          placeholder="例: ライフスタイル、副業、健康"
          className={inputClasses}
        />
      </div>

      <div className="h-px bg-[#e5e5e7]/60" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>note メールアドレス</label>
          <input
            type="email"
            required
            value={noteEmail}
            onChange={(e) => setNoteEmail(e.target.value)}
            placeholder="user@example.com"
            className={inputClasses}
          />
        </div>
        <div>
          <label className={labelClasses}>note パスワード</label>
          <input
            type="password"
            value={notePassword}
            onChange={(e) => setNotePassword(e.target.value)}
            placeholder={account ? "変更しない場合は空欄" : "••••••••"}
            className={inputClasses}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClasses}>X ユーザー名</label>
          <input
            type="text"
            required
            value={xUsername}
            onChange={(e) => setXUsername(e.target.value)}
            placeholder="@username"
            className={inputClasses}
          />
        </div>
        <div>
          <label className={labelClasses}>X パスワード</label>
          <input
            type="password"
            value={xPassword}
            onChange={(e) => setXPassword(e.target.value)}
            placeholder={account ? "変更しない場合は空欄" : "••••••••"}
            className={inputClasses}
          />
        </div>
      </div>

      <div className="h-px bg-[#e5e5e7]/60" />

      <div>
        <label className={labelClasses}>投稿間隔（分）</label>
        <input
          type="number"
          required
          min={1}
          value={postInterval}
          onChange={(e) => setPostInterval(Number(e.target.value))}
          className={inputClasses}
        />
      </div>

      <div className="flex justify-end gap-3 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-5 py-2.5 text-[13px] font-medium text-[#86868b] transition-all duration-200 hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-[#0071e3] px-6 py-2.5 text-[13px] font-medium text-white transition-all duration-200 hover:bg-[#0077ed] active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  );
}
