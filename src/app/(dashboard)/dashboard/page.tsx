import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Users,
  FileText,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Account, Post, Log } from "@/types/database";

const cycleLabels: Record<string, string> = {
  morning: "朝",
  noon: "昼",
  night: "夜",
};

function StatusIcon({ status }: { status: Post["status"] | "pending" }) {
  switch (status) {
    case "posted":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "failed":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "queued":
      return <Clock className="h-5 w-5 text-yellow-500" />;
    default:
      return <AlertCircle className="h-5 w-5 text-gray-400" />;
  }
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [accountsRes, postsRes, logsRes] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("posts")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const accounts: Account[] = accountsRes.data ?? [];
  const todayPosts: Post[] = postsRes.data ?? [];
  const recentLogs: Log[] = logsRes.data ?? [];

  const totalPosted = todayPosts.filter((p) => p.status === "posted").length;
  const successRate =
    todayPosts.length > 0
      ? Math.round((totalPosted / todayPosts.length) * 100)
      : 0;

  // Build status grid: for each account, check each cycle
  const cycles: Post["cycle"][] = ["morning", "noon", "night"];
  const accountStatuses = accounts.map((account) => {
    const accountPosts = todayPosts.filter(
      (p) => p.account_id === account.id
    );
    const cycleStatuses = cycles.map((cycle) => {
      const post = accountPosts.find((p) => p.cycle === cycle);
      return {
        cycle,
        status: post ? post.status : ("pending" as const),
      };
    });
    return { account, cycleStatuses };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          ダッシュボード
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          本日の投稿状況と統計情報
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2.5 dark:bg-blue-900/30">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                本日の投稿数
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {totalPosted}
                <span className="text-sm font-normal text-gray-400">
                  {" "}
                  / {accounts.length * 3}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 p-2.5 dark:bg-green-900/30">
              <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                成功率
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {successRate}%
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-50 p-2.5 dark:bg-purple-900/30">
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                総アカウント数
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {accounts.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Today's posting status per account */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            本日の投稿状況
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="px-6 py-3 text-left font-medium text-gray-500 dark:text-gray-400">
                  アカウント
                </th>
                {cycles.map((c) => (
                  <th
                    key={c}
                    className="px-6 py-3 text-center font-medium text-gray-500 dark:text-gray-400"
                  >
                    {cycleLabels[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accountStatuses.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-gray-400"
                  >
                    アカウントがありません
                  </td>
                </tr>
              ) : (
                accountStatuses.map(({ account, cycleStatuses }) => (
                  <tr
                    key={account.id}
                    className="border-b border-gray-50 dark:border-gray-800/50"
                  >
                    <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
                      {account.name}
                      <span className="ml-2 text-xs text-gray-400">
                        @{account.x_username}
                      </span>
                    </td>
                    {cycleStatuses.map(({ cycle, status }) => (
                      <td key={cycle} className="px-6 py-3 text-center">
                        <div className="flex justify-center">
                          <StatusIcon status={status} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent activity log */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            最近のアクティビティ
          </h2>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {recentLogs.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400">
              アクティビティはありません
            </div>
          ) : (
            recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 px-6 py-3"
              >
                <div
                  className={`mt-0.5 h-2 w-2 rounded-full ${
                    log.level === "error"
                      ? "bg-red-500"
                      : log.level === "warn"
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                />
                <div className="flex-1">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {log.message}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(log.created_at).toLocaleString("ja-JP")}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
