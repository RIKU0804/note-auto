import { createClient } from "@/lib/supabase/server";
import type { Account, Post, Log } from "@/types/database";

const cycleLabels: Record<string, string> = {
  morning: "朝",
  noon: "昼",
  night: "夜",
};

function getGreeting(): string {
  const hour = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  ).getHours();
  if (hour < 12) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "おつかれさまです";
}

function StatusDot({ status }: { status: Post["status"] | "pending" }) {
  const colors: Record<string, string> = {
    posted: "bg-[#34c759]",
    failed: "bg-[#ff3b30]",
    queued: "bg-[#ff9f0a]",
    pending: "bg-[#d1d1d6]",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colors[status] ?? colors.pending}`}
    />
  );
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
    <div className="space-y-10">
      {/* Greeting */}
      <div>
        <h1 className="text-[32px] font-bold tracking-tight text-[#1d1d1f]">
          {getGreeting()}
        </h1>
        <p className="mt-1.5 text-[15px] text-[#86868b]">
          本日の投稿状況と統計情報
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-black/[0.04]">
          <p className="text-[13px] font-medium text-[#86868b]">
            本日の投稿数
          </p>
          <p className="mt-2 text-[36px] font-bold tracking-tight text-[#1d1d1f] leading-none">
            {totalPosted}
            <span className="ml-1 text-[15px] font-normal text-[#aeaeb2]">
              / {accounts.length * 3}
            </span>
          </p>
        </div>

        <div className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-black/[0.04]">
          <p className="text-[13px] font-medium text-[#86868b]">
            成功率
          </p>
          <p className="mt-2 text-[36px] font-bold tracking-tight text-[#1d1d1f] leading-none">
            {successRate}
            <span className="ml-0.5 text-[15px] font-normal text-[#aeaeb2]">
              %
            </span>
          </p>
        </div>

        <div className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-black/[0.04]">
          <p className="text-[13px] font-medium text-[#86868b]">
            総アカウント数
          </p>
          <p className="mt-2 text-[36px] font-bold tracking-tight text-[#1d1d1f] leading-none">
            {accounts.length}
          </p>
        </div>
      </div>

      {/* Today's posting status */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
        <div className="px-7 py-5">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f]">
            本日の投稿状況
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-t border-[#e5e5e7]/60">
                <th className="px-7 py-3 text-left text-[12px] font-medium uppercase tracking-wider text-[#86868b]">
                  アカウント
                </th>
                {cycles.map((c) => (
                  <th
                    key={c}
                    className="px-7 py-3 text-center text-[12px] font-medium uppercase tracking-wider text-[#86868b]"
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
                    className="px-7 py-12 text-center text-[14px] text-[#aeaeb2]"
                  >
                    アカウントがありません
                  </td>
                </tr>
              ) : (
                accountStatuses.map(({ account, cycleStatuses }) => (
                  <tr
                    key={account.id}
                    className="border-t border-[#f5f5f7]"
                  >
                    <td className="px-7 py-4">
                      <span className="text-[14px] font-medium text-[#1d1d1f]">
                        {account.name}
                      </span>
                      <span className="ml-2 text-[12px] text-[#aeaeb2]">
                        @{account.x_username}
                      </span>
                    </td>
                    {cycleStatuses.map(({ cycle, status }) => (
                      <td key={cycle} className="px-7 py-4 text-center">
                        <StatusDot status={status} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
        <div className="px-7 py-5">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f]">
            最近のアクティビティ
          </h2>
        </div>
        <div>
          {recentLogs.length === 0 ? (
            <div className="px-7 py-12 text-center text-[14px] text-[#aeaeb2]">
              アクティビティはありません
            </div>
          ) : (
            recentLogs.map((log, index) => (
              <div
                key={log.id}
                className={`flex items-start gap-4 px-7 py-4 ${
                  index > 0 ? "border-t border-[#f5f5f7]" : "border-t border-[#e5e5e7]/60"
                }`}
              >
                <div className="mt-1.5 flex-shrink-0">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      log.level === "error"
                        ? "bg-[#ff3b30]"
                        : log.level === "warn"
                          ? "bg-[#ff9f0a]"
                          : "bg-[#34c759]"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-[#1d1d1f] leading-relaxed">
                    {log.message}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#aeaeb2]">
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
