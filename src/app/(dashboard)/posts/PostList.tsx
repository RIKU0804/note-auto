"use client";

import { useState } from "react";
import {
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import type { Account, Post } from "@/types/database";

const cycleLabels: Record<string, string> = {
  morning: "朝",
  noon: "昼",
  night: "夜",
};

const statusConfig: Record<
  Post["status"],
  { label: string; dot: string; text: string }
> = {
  queued: { label: "待機中", dot: "bg-[#ff9f0a]", text: "text-[#ff9f0a]" },
  posted: { label: "投稿済み", dot: "bg-[#34c759]", text: "text-[#34c759]" },
  failed: { label: "失敗", dot: "bg-[#ff3b30]", text: "text-[#ff3b30]" },
};

const PER_PAGE = 10;

const filterSelectClasses =
  "rounded-xl border border-[#e5e5e7] bg-[#fafafa] px-3.5 py-2.5 text-[13px] text-[#1d1d1f] outline-none transition-all duration-200 focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/10";

export default function PostList({
  initialPosts,
  accounts,
  totalCount,
}: {
  initialPosts: Post[];
  accounts: Pick<Account, "id" | "name">[];
  totalCount: number;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(totalCount);
  const [loading, setLoading] = useState(false);

  const [filterAccount, setFilterAccount] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const totalPages = Math.ceil(total / PER_PAGE);

  const fetchPosts = async (newPage: number) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("offset", String(newPage * PER_PAGE));
    params.set("limit", String(PER_PAGE));
    if (filterAccount) params.set("account_id", filterAccount);
    if (filterStatus) params.set("status", filterStatus);
    if (filterDateFrom) params.set("date_from", filterDateFrom);
    if (filterDateTo) params.set("date_to", filterDateTo);

    try {
      const res = await fetch(`/api/posts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts);
        setTotal(data.total);
        setPage(newPage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    fetchPosts(0);
  };

  const handleRetry = async (postId: string) => {
    const res = await fetch(`/api/posts/${postId}/retry`, { method: "POST" });
    if (res.ok) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, status: "queued" as const, error_message: null }
            : p
        )
      );
    }
  };

  const accountName = (id: string) =>
    accounts.find((a) => a.id === id)?.name ?? "不明";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[32px] font-bold tracking-tight text-[#1d1d1f]">
          投稿一覧
        </h1>
        <p className="mt-1.5 text-[15px] text-[#86868b]">
          すべての投稿履歴を確認
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filterAccount}
          onChange={(e) => setFilterAccount(e.target.value)}
          className={filterSelectClasses}
        >
          <option value="">すべてのアカウント</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className={filterSelectClasses}
        >
          <option value="">すべてのステータス</option>
          <option value="queued">待機中</option>
          <option value="posted">投稿済み</option>
          <option value="failed">失敗</option>
        </select>

        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          className={filterSelectClasses}
          placeholder="開始日"
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className={filterSelectClasses}
          placeholder="終了日"
        />

        <button
          onClick={handleFilter}
          className="rounded-full bg-[#0071e3] px-5 py-2.5 text-[13px] font-medium text-white transition-all duration-200 hover:bg-[#0077ed] active:scale-[0.98]"
        >
          適用
        </button>
      </div>

      {/* Posts table */}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e5e7]/60">
              <th className="px-6 py-3.5 text-left text-[12px] font-medium uppercase tracking-wider text-[#86868b]">
                日時
              </th>
              <th className="px-6 py-3.5 text-left text-[12px] font-medium uppercase tracking-wider text-[#86868b]">
                アカウント
              </th>
              <th className="px-6 py-3.5 text-left text-[12px] font-medium uppercase tracking-wider text-[#86868b]">
                サイクル
              </th>
              <th className="px-6 py-3.5 text-left text-[12px] font-medium uppercase tracking-wider text-[#86868b]">
                タイトル
              </th>
              <th className="px-6 py-3.5 text-left text-[12px] font-medium uppercase tracking-wider text-[#86868b]">
                ステータス
              </th>
              <th className="px-6 py-3.5 text-left text-[12px] font-medium uppercase tracking-wider text-[#86868b]">
                URL
              </th>
              <th className="px-6 py-3.5 text-left text-[12px] font-medium uppercase tracking-wider text-[#86868b]">
                操作
              </th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-40" : ""}>
            {posts.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-16 text-center text-[14px] text-[#aeaeb2]"
                >
                  投稿がありません
                </td>
              </tr>
            ) : (
              posts.map((post) => {
                const config = statusConfig[post.status];
                return (
                  <tr
                    key={post.id}
                    className="border-t border-[#f5f5f7] transition-colors hover:bg-[#fafafa]"
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-[13px] text-[#6e6e73]">
                      {new Date(post.created_at).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-[#1d1d1f]">
                      {accountName(post.account_id)}
                    </td>
                    <td className="px-6 py-4 text-[13px] text-[#6e6e73]">
                      {cycleLabels[post.cycle]}
                    </td>
                    <td className="max-w-[200px] truncate px-6 py-4 text-[13px] font-medium text-[#1d1d1f]">
                      {post.title}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-2 text-[12px] font-medium ${config.text}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${config.dot}`}
                        />
                        {config.label}
                      </span>
                      {post.status === "failed" && post.error_message && (
                        <p className="mt-1 text-[11px] text-[#aeaeb2]">
                          {post.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {post.note_url && (
                        <a
                          href={post.note_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[13px] text-[#0071e3] transition-colors hover:text-[#0077ed]"
                        >
                          <ExternalLink
                            className="h-3.5 w-3.5"
                            strokeWidth={1.8}
                          />
                          note
                        </a>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {post.status === "failed" && (
                        <button
                          onClick={() => handleRetry(post.id)}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-[#86868b] ring-1 ring-[#e5e5e7] transition-all duration-200 hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
                        >
                          <RefreshCw className="h-3 w-3" strokeWidth={2} />
                          再試行
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[13px] text-[#86868b]">
            全 {total} 件中 {page * PER_PAGE + 1} -{" "}
            {Math.min((page + 1) * PER_PAGE, total)} 件
          </p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => fetchPosts(page - 1)}
              disabled={page === 0 || loading}
              className="text-[13px] font-medium text-[#0071e3] transition-colors hover:text-[#0077ed] disabled:text-[#d1d1d6] disabled:cursor-not-allowed"
            >
              前へ
            </button>
            <span className="text-[13px] text-[#86868b]">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => fetchPosts(page + 1)}
              disabled={page >= totalPages - 1 || loading}
              className="text-[13px] font-medium text-[#0071e3] transition-colors hover:text-[#0077ed] disabled:text-[#d1d1d6] disabled:cursor-not-allowed"
            >
              次へ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
