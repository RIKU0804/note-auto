import { createClient } from "@/lib/supabase/server";
import type { User } from "@/types/database";
import { PLAN_LIMITS } from "@/types/database";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  const userData = data as User | null;
  const plan = userData?.plan ?? "free";

  return (
    <div className="space-y-10">
      <div>
        <h1
          className="text-3xl font-bold"
          style={{ color: '#26251e', letterSpacing: '-0.03em' }}
        >
          設定
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'rgba(38, 37, 30, 0.55)' }}>
          アカウント設定と通知の管理
        </p>
      </div>

      {/* Current plan */}
      <div
        className="rounded-lg p-6"
        style={{ background: '#f7f7f4', border: '1px solid rgba(38, 37, 30, 0.1)' }}
      >
        <h2
          className="text-sm font-semibold"
          style={{ color: '#26251e', letterSpacing: '-0.01em' }}
        >
          現在のプラン
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {Object.values(PLAN_LIMITS).map((p) => {
            const isCurrent = p.plan === plan;
            return (
              <div
                key={p.plan}
                className="rounded-lg p-4"
                style={{
                  background: isCurrent ? '#e6e5e0' : '#f2f1ed',
                  border: isCurrent
                    ? '2px solid #f54e00'
                    : '1px solid rgba(38, 37, 30, 0.1)',
                }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold" style={{ color: '#26251e' }}>
                    {p.label}
                  </h3>
                  {isCurrent && (
                    <span
                      className="px-2 py-0.5 text-xs font-medium"
                      style={{
                        borderRadius: '9999px',
                        background: '#f54e00',
                        color: '#fff',
                      }}
                    >
                      現在
                    </span>
                  )}
                </div>
                <p className="mt-1 text-lg font-bold" style={{ color: '#26251e' }}>
                  {p.price}
                </p>
                <p className="mt-1 text-sm" style={{ color: 'rgba(38, 37, 30, 0.55)' }}>
                  最大 {p.max_accounts} アカウント
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Discord Webhook settings */}
      <div
        className="rounded-lg p-6"
        style={{ background: '#f7f7f4', border: '1px solid rgba(38, 37, 30, 0.1)' }}
      >
        <h2
          className="mb-4 text-sm font-semibold"
          style={{ color: '#26251e', letterSpacing: '-0.01em' }}
        >
          Discord 通知設定
        </h2>
        <SettingsForm
          initialWebhookUrl={userData?.discord_webhook_url ?? ""}
        />
      </div>
    </div>
  );
}
