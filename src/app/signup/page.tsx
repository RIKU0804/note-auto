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
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
        <div className="w-full max-w-[380px] text-center">
          <div className="rounded-2xl bg-white p-10 shadow-sm ring-1 ring-black/[0.04]">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#f0faf0]">
              <svg
                className="h-6 w-6 text-[#34c759]"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <h1 className="text-[20px] font-semibold text-[#1d1d1f]">
              確認メールを送信しました
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-[#86868b]">
              メールに記載されたリンクをクリックして、アカウントを有効化してください。
            </p>
          </div>
          <Link
            href="/login"
            className="mt-6 inline-block text-[13px] font-medium text-[#0071e3] transition-colors hover:text-[#0077ed]"
          >
            ログインページへ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
      <div className="w-full max-w-[380px]">
        <div className="text-center">
          <h1 className="text-[28px] font-bold tracking-tight text-[#1d1d1f]">
            note-auto
          </h1>
          <p className="mt-2 text-[15px] text-[#86868b]">
            新規アカウント作成
          </p>
        </div>

        <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/[0.04]">
          <form onSubmit={handleSignup} className="space-y-5">
            {error && (
              <div className="rounded-xl bg-[#fff0f0] px-4 py-3 text-[13px] text-[#ff3b30]">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-[12px] font-medium uppercase tracking-wider text-[#86868b] mb-1.5"
              >
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[#e5e5e7] bg-[#fafafa] px-4 py-3 text-[14px] text-[#1d1d1f] outline-none transition-all duration-200 placeholder:text-[#aeaeb2] focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/10"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[12px] font-medium uppercase tracking-wider text-[#86868b] mb-1.5"
              >
                パスワード
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#e5e5e7] bg-[#fafafa] px-4 py-3 text-[14px] text-[#1d1d1f] outline-none transition-all duration-200 placeholder:text-[#aeaeb2] focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/10"
                placeholder="6文字以上"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#0071e3] px-4 py-3 text-[14px] font-medium text-white transition-all duration-200 hover:bg-[#0077ed] active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "登録中..." : "新規登録"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[13px] text-[#86868b]">
          すでにアカウントをお持ちの方は{" "}
          <Link
            href="/login"
            className="font-medium text-[#0071e3] transition-colors hover:text-[#0077ed]"
          >
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}
