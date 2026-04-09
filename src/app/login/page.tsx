"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
      <div className="w-full max-w-[380px]">
        <div className="text-center">
          <h1 className="text-[28px] font-bold tracking-tight text-[#1d1d1f]">
            note-auto
          </h1>
          <p className="mt-2 text-[15px] text-[#86868b]">
            アカウントにログイン
          </p>
        </div>

        <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/[0.04]">
          <form onSubmit={handleLogin} className="space-y-5">
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#e5e5e7] bg-[#fafafa] px-4 py-3 text-[14px] text-[#1d1d1f] outline-none transition-all duration-200 placeholder:text-[#aeaeb2] focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/10"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#0071e3] px-4 py-3 text-[14px] font-medium text-white transition-all duration-200 hover:bg-[#0077ed] active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "ログイン中..." : "ログイン"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[13px] text-[#86868b]">
          アカウントをお持ちでない方は{" "}
          <Link
            href="/signup"
            className="font-medium text-[#0071e3] transition-colors hover:text-[#0077ed]"
          >
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}
