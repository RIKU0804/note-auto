"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Account, Post } from "@/types/database";

const cycleLabels: Record<string, string> = {
  morning: "朝",
  noon: "昼",
  night: "夜",
};

const statusLabels: Record<Post["status"], string> = {
  queued: "待機中",
  posted: "投稿済み",
  failed: "失敗",
};

const PER_PAGE = 10;

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

  // Filters
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
        prev.map((p) => (p.id === postId ? { ...p, status: "queued" as const, error_message: null } : p))
      );
    }
  };

  const accountName = (id: string) =>
    accounts.find((a) => a.id === id)?.name ?? "不明";

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <select
          value={filterAccount}
          onChange={(e) => setFilterAccount(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
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
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
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
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          placeholder="開始日"
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          placeholder="終了日"
        />

        <button
          onClick={handleFilter}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          フィルター適用
        </button>
      </div>

      {/* Posts table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                日時
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                アカウント
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                サイクル
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                タイトル
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                ステータス
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                URL
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                操作
              </th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-50" : ""}>
            {posts.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  投稿がありません
                </td>
              </tr>
            ) : (
              posts.map((post) => (
                <tr
                  key={post.id}
                  className="border-b border-gray-50 dark:border-gray-800/50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">
                    {new Date(post.created_at).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {accountName(post.account_id)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {cycleLabels[post.cycle]}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {post.title}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        post.status === "posted"
                          ? "text-green-600"
                          : post.status === "failed"
                            ? "text-red-600"
                            : "text-yellow-600"
                      }`}
                    >
                      {post.status === "posted" && (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      {post.status === "failed" && (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      {post.status === "queued" && (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                      {statusLabels[post.status]}
                    </span>
                    {post.status === "failed" && post.error_message && (
                      <p className="mt-1 text-xs text-red-400">
                        {post.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {post.note_url && (
                      <a
                        href={post.note_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        note
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {post.status === "failed" && (
                      <button
                        onClick={() => handleRetry(post.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/30"
                      >
                        <RefreshCw className="h-3 w-3" />
                        再試行
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            全 {total} 件中 {page * PER_PAGE + 1} -{" "}
            {Math.min((page + 1) * PER_PAGE, total)} 件
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => fetchPosts(page - 1)}
              disabled={page === 0 || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="h-4 w-4" />
              前へ
            </button>
            <button
              onClick={() => fetchPosts(page + 1)}
              disabled={page >= totalPages - 1 || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              次へ
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
