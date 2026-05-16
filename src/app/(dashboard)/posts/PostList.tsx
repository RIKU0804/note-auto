"use client";

import { useState } from "react";
import {
  ExternalLink,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Account, Post } from "@/types/database";

const cycleLabels: Record<string, string> = {
  morning: "朝",
  night: "夜",
};

const statusLabels: Record<Post["status"], string> = {
  queued: "待機中",
  posted: "投稿済み",
  failed: "失敗",
};

const statusColors: Record<Post["status"], string> = {
  posted: "#1f8a65",
  failed: "#cf2d56",
  queued: "#c08532",
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
  // page is 1-indexed to match the API contract.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(totalCount);
  const [loading, setLoading] = useState(false);

  const [filterAccount, setFilterAccount] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const fetchPosts = async (newPage: number) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(newPage));
    params.set("limit", String(PER_PAGE));
    if (filterAccount) params.set("account_id", filterAccount);
    if (filterStatus) params.set("status", filterStatus);
    if (filterDateFrom) params.set("date_from", filterDateFrom);
    if (filterDateTo) params.set("date_to", filterDateTo);

    try {
      const res = await fetch(`/api/posts?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setPosts(json.data ?? []);
        setTotal(json.pagination?.total ?? 0);
        setPage(newPage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    fetchPosts(1);
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

  const tweetUrl = (post: Post): string | null => {
    if (!post.x_tweet_id) return null;
    // The accounts prop only carries id/name — we don't have the X username
    // here, so use the username-agnostic /i/status/ form which X resolves.
    return `https://x.com/i/status/${post.x_tweet_id}`;
  };

  const selectStyle = {
    background: '#e6e5e0',
    border: '1px solid rgba(38, 37, 30, 0.1)',
    color: '#26251e',
    borderRadius: '9999px',
  };

  const dateInputStyle = {
    background: 'transparent',
    border: '1px solid rgba(38, 37, 30, 0.1)',
    color: '#26251e',
    borderRadius: '8px',
  };

  return (
    <>
      {/* Filters */}
      <div
        className="flex flex-wrap gap-3 rounded-lg p-4"
        style={{ background: '#f7f7f4', border: '1px solid rgba(38, 37, 30, 0.1)' }}
      >
        <select
          value={filterAccount}
          onChange={(e) => setFilterAccount(e.target.value)}
          className="px-3 py-2 text-sm outline-none"
          style={selectStyle}
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
          className="px-3 py-2 text-sm outline-none"
          style={selectStyle}
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
          className="px-3 py-2 text-sm outline-none"
          style={dateInputStyle}
          placeholder="開始日"
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className="px-3 py-2 text-sm outline-none"
          style={dateInputStyle}
          placeholder="終了日"
        />

        <button
          onClick={handleFilter}
          className="px-4 py-2 text-sm font-medium transition-colors"
          style={{
            borderRadius: '9999px',
            background: '#ebeae5',
            color: '#26251e',
            border: '1px solid rgba(38, 37, 30, 0.1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#cf2d56'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#26251e'; }}
        >
          フィルター適用
        </button>
      </div>

      {/* Posts table */}
      <div
        className="overflow-x-auto rounded-lg"
        style={{ background: '#f7f7f4', border: '1px solid rgba(38, 37, 30, 0.1)' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(38, 37, 30, 0.1)' }}>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
                日時
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
                アカウント
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
                サイクル
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
                ツイート
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
                ステータス
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
                URL
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
                操作
              </th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-50" : ""}>
            {posts.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center"
                  style={{ color: 'rgba(38, 37, 30, 0.62)' }}
                >
                  投稿がありません
                </td>
              </tr>
            ) : (
              posts.map((post) => {
                const url = tweetUrl(post);
                return (
                  <tr
                    key={post.id}
                    style={{ borderBottom: '1px solid rgba(38, 37, 30, 0.06)' }}
                  >
                    <td className="whitespace-nowrap px-4 py-3" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
                      {new Date(post.created_at).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="px-4 py-3" style={{ color: '#26251e' }}>
                      {accountName(post.account_id)}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
                      {cycleLabels[post.cycle] ?? post.cycle}
                    </td>
                    <td className="max-w-[280px] truncate px-4 py-3" style={{ color: '#26251e' }}>
                      {post.tweet_text}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: statusColors[post.status] }}
                        />
                        <span style={{ color: statusColors[post.status] }}>
                          {statusLabels[post.status]}
                        </span>
                      </span>
                      {post.status === "failed" && post.error_message && (
                        <p className="mt-1 text-xs" style={{ color: 'rgba(207, 45, 86, 0.7)' }}>
                          {post.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm transition-colors"
                          style={{ color: '#d94400' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#cf2d56'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = '#d94400'; }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          X
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {post.status === "failed" && (
                        <button
                          onClick={() => handleRetry(post.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors"
                          style={{
                            borderRadius: '9999px',
                            background: 'rgba(245, 78, 0, 0.08)',
                            color: '#d94400',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(245, 78, 0, 0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(245, 78, 0, 0.08)';
                          }}
                        >
                          <RefreshCw className="h-3 w-3" />
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
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
            全 {total} 件中 {(page - 1) * PER_PAGE + 1} -{" "}
            {Math.min(page * PER_PAGE, total)} 件
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => fetchPosts(page - 1)}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40"
              style={{ color: 'rgba(38, 37, 30, 0.72)' }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = '#26251e'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(38, 37, 30, 0.72)'; }}
            >
              <ChevronLeft className="h-4 w-4" />
              前へ
            </button>
            <button
              onClick={() => fetchPosts(page + 1)}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40"
              style={{ color: 'rgba(38, 37, 30, 0.72)' }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = '#26251e'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(38, 37, 30, 0.72)'; }}
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
