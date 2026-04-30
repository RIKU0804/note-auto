"use client";

import { useState } from "react";
import type { Account } from "@/types/database";

type Genre = { id: string; label: string };

const inputStyle = {
  background: 'transparent',
  border: '1px solid rgba(38, 37, 30, 0.1)',
  color: '#26251e',
  borderRadius: '8px',
};

const inputFocusClass = "w-full px-3 py-2 text-sm outline-none transition-colors focus:border-[rgba(38,37,30,0.3)]";
const inputClasses = inputFocusClass;

const labelStyle = {
  color: 'rgba(38, 37, 30, 0.72)',
  fontSize: '0.75rem',
  fontWeight: 500 as const,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

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
      x_username: xUsername,
      post_interval_minutes: postInterval,
    };

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
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg p-3 text-sm"
          style={{ background: 'rgba(207, 45, 86, 0.08)', color: '#cf2d56' }}
        >
          {error}
        </div>
      )}

      <div>
        <label className="mb-1.5 block" style={labelStyle}>
          アカウント名
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 自己啓発アカウント"
          className={inputFocusClass}
          style={inputStyle}
        />
      </div>

      <div>
        <label className="mb-1.5 block" style={labelStyle}>
          ジャンル
        </label>
        <select
          value={genreId}
          onChange={(e) => setGenreId(e.target.value)}
          required
          className={inputClasses}
          style={inputStyle}
        >
          {genres.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block" style={labelStyle}>
            X ユーザー名
          </label>
          <input
            type="text"
            required
            value={xUsername}
            onChange={(e) => setXUsername(e.target.value)}
            placeholder="@username"
            className={inputFocusClass}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="mb-1.5 block" style={labelStyle}>
            X パスワード
          </label>
          <input
            type="password"
            autoComplete="new-password"
            value={xPassword}
            onChange={(e) => setXPassword(e.target.value)}
            placeholder={account ? "変更しない場合は空欄" : "--------"}
            className={inputFocusClass}
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block" style={labelStyle}>
          投稿間隔（分）
        </label>
        <input
          type="number"
          required
          min={1}
          value={postInterval}
          onChange={(e) => setPostInterval(Number(e.target.value))}
          className={inputFocusClass}
          style={inputStyle}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
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
          type="submit"
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            background: '#ebeae5',
            color: '#26251e',
            border: '1px solid rgba(38, 37, 30, 0.1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#cf2d56'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#26251e'; }}
        >
          {loading ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  );
}
