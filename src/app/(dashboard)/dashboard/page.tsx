import { createClient } from "@/lib/supabase/server";
import type { Account, Post, Log } from "@/types/database";

const cycleLabels: Record<string, string> = {
  morning: "朝",
  noon: "昼",
  night: "夜",
};

function StatusDot({ status }: { status: Post["status"] | "pending" }) {
  const colors: Record<string, string> = {
    posted: "#1f8a65",
    failed: "#cf2d56",
    queued: "#c08532",
    pending: "rgba(38, 37, 30, 0.15)",
  };
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: colors[status] ?? colors.pending }}
    />
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
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
        <h1
          className="text-3xl font-bold"
          style={{ color: '#26251e', letterSpacing: '-0.03em' }}
        >
          {getGreeting()}
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
          本日の投稿状況と統計情報
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div
          className="rounded-lg p-6"
          style={{ background: '#e6e5e0', border: '1px solid rgba(38, 37, 30, 0.1)' }}
        >
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
            本日の投稿数
          </p>
          <p className="mt-2 text-3xl font-bold" style={{ color: '#26251e', letterSpacing: '-0.02em' }}>
            {totalPosted}
            <span className="ml-1 text-sm font-normal" style={{ color: 'rgba(38, 37, 30, 0.62)' }}>
              / {accounts.length * 3}
            </span>
          </p>
        </div>

        <div
          className="rounded-lg p-6"
          style={{ background: '#e6e5e0', border: '1px solid rgba(38, 37, 30, 0.1)' }}
        >
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
            成功率
          </p>
          <p className="mt-2 text-3xl font-bold" style={{ color: '#26251e', letterSpacing: '-0.02em' }}>
            {successRate}
            <span className="text-sm font-normal" style={{ color: 'rgba(38, 37, 30, 0.62)' }}>%</span>
          </p>
        </div>

        <div
          className="rounded-lg p-6"
          style={{ background: '#e6e5e0', border: '1px solid rgba(38, 37, 30, 0.1)' }}
        >
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(38, 37, 30, 0.72)' }}>
            総アカウント数
          </p>
          <p className="mt-2 text-3xl font-bold" style={{ color: '#26251e', letterSpacing: '-0.02em' }}>
            {accounts.length}
          </p>
        </div>
      </div>

      {/* Today's posting status per account */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: '#f7f7f4', border: '1px solid rgba(38, 37, 30, 0.1)' }}
      >
        <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(38, 37, 30, 0.1)' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#26251e', letterSpacing: '-0.01em' }}>
            本日の投稿状況
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(38, 37, 30, 0.1)' }}>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'rgba(38, 37, 30, 0.72)' }}
                >
                  アカウント
                </th>
                {cycles.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider"
                    style={{ color: 'rgba(38, 37, 30, 0.72)' }}
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
                    className="px-6 py-8 text-center text-sm"
                    style={{ color: 'rgba(38, 37, 30, 0.62)' }}
                  >
                    アカウントがありません
                  </td>
                </tr>
              ) : (
                accountStatuses.map(({ account, cycleStatuses }) => (
                  <tr
                    key={account.id}
                    style={{ borderBottom: '1px solid rgba(38, 37, 30, 0.06)' }}
                  >
                    <td className="px-6 py-3 font-medium" style={{ color: '#26251e' }}>
                      {account.name}
                      <span className="ml-2 text-xs" style={{ color: 'rgba(38, 37, 30, 0.62)' }}>
                        @{account.x_username}
                      </span>
                    </td>
                    {cycleStatuses.map(({ cycle, status }) => (
                      <td key={cycle} className="px-6 py-3 text-center">
                        <div className="flex justify-center">
                          <StatusDot status={status} />
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
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: '#f7f7f4', border: '1px solid rgba(38, 37, 30, 0.1)' }}
      >
        <div className="px-6 py-4" style={{ borderBottom: '1px solid rgba(38, 37, 30, 0.1)' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#26251e', letterSpacing: '-0.01em' }}>
            最近のアクティビティ
          </h2>
        </div>
        <div>
          {recentLogs.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm" style={{ color: 'rgba(38, 37, 30, 0.62)' }}>
              アクティビティはありません
            </div>
          ) : (
            recentLogs.map((log, i) => (
              <div
                key={log.id}
                className="flex items-start gap-3 px-6 py-3"
                style={{
                  borderBottom:
                    i < recentLogs.length - 1
                      ? '1px solid rgba(38, 37, 30, 0.06)'
                      : 'none',
                }}
              >
                <div
                  className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                  style={{
                    background:
                      log.level === "error"
                        ? "#cf2d56"
                        : log.level === "warn"
                          ? "#c08532"
                          : "#1f8a65",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: '#26251e' }}>
                    {log.message}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: 'rgba(38, 37, 30, 0.62)' }}>
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
