"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: '#f2f1ed' }}
      >
        <div
          className="w-full max-w-sm space-y-6 rounded-lg p-8 text-center"
          style={{
            background: '#f7f7f4',
            border: '1px solid rgba(38, 37, 30, 0.1)',
            boxShadow: '0 28px 70px rgba(38, 37, 30, 0.08)',
          }}
        >
          <h1
            className="text-2xl font-bold"
            style={{ color: '#26251e', letterSpacing: '-0.03em' }}
          >
            確認メールを送信しました
          </h1>
          <p className="text-sm" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
            メールに記載されたリンクをクリックして、アカウントを有効化してください。
          </p>
          <Link
            href="/login"
            className="inline-block text-sm font-medium transition-colors"
            style={{ color: '#d94400' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#cf2d56'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#d94400'; }}
          >
            ログインページへ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: '#f2f1ed' }}
    >
      <div
        className="w-full max-w-sm space-y-6 rounded-lg p-8"
        style={{
          background: '#f7f7f4',
          border: '1px solid rgba(38, 37, 30, 0.1)',
          boxShadow: '0 28px 70px rgba(38, 37, 30, 0.08)',
        }}
      >
        <div className="text-center">
          <h1
            className="text-2xl font-bold"
            style={{ color: '#26251e', letterSpacing: '-0.03em' }}
          >
            note-auto
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
            新規アカウント作成
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
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
            <label
              htmlFor="email"
              className="mb-1.5 block"
              style={{
                color: 'rgba(38, 37, 30, 0.72)',
                fontSize: '0.75rem',
                fontWeight: 500,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
              }}
            >
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm outline-none transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid rgba(38, 37, 30, 0.1)',
                color: '#26251e',
                borderRadius: '8px',
              }}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block"
              style={{
                color: 'rgba(38, 37, 30, 0.72)',
                fontSize: '0.75rem',
                fontWeight: 500,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.05em',
              }}
            >
              パスワード
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm outline-none transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid rgba(38, 37, 30, 0.1)',
                color: '#26251e',
                borderRadius: '8px',
              }}
              placeholder="6文字以上"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              background: '#26251e',
              color: '#f7f7f4',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#3a392f'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#26251e'; }}
          >
            {loading ? "登録中..." : "新規登録"}
          </button>
        </form>

        <p className="text-center text-sm" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
          すでにアカウントをお持ちの方は{" "}
          <Link
            href="/login"
            className="font-medium transition-colors"
            style={{ color: '#d94400' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#cf2d56'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#d94400'; }}
          >
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}
