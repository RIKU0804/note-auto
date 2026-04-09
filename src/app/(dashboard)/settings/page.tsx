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
  const limits = PLAN_LIMITS[plan];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[32px] font-bold tracking-tight text-[#1d1d1f]">
          設定
        </h1>
        <p className="mt-1.5 text-[15px] text-[#86868b]">
          アカウント設定と通知の管理
        </p>
      </div>

      {/* Current plan */}
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/[0.04]">
        <h2 className="text-[17px] font-semibold text-[#1d1d1f]">
          ご利用プラン
        </h2>
        <p className="mt-1 text-[13px] text-[#86868b]">
          現在のプランと利用可能なオプション
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {Object.values(PLAN_LIMITS).map((p) => {
            const isCurrent = p.plan === plan;
            return (
              <div
                key={p.plan}
                className={`rounded-2xl p-5 transition-all duration-200 ${
                  isCurrent
                    ? "bg-[#f5f5f7] ring-2 ring-[#0071e3]"
                    : "bg-[#fafafa] ring-1 ring-[#e5e5e7]/60 hover:ring-[#d1d1d6]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-[#1d1d1f]">
                    {p.label}
                  </h3>
                  {isCurrent && (
                    <span className="rounded-full bg-[#0071e3] px-2.5 py-0.5 text-[11px] font-medium text-white">
                      現在
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[24px] font-bold tracking-tight text-[#1d1d1f]">
                  {p.price}
                </p>
                <p className="mt-1 text-[13px] text-[#86868b]">
                  最大 {p.max_accounts} アカウント
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Discord Webhook settings */}
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/[0.04]">
        <h2 className="text-[17px] font-semibold text-[#1d1d1f]">
          Discord 通知設定
        </h2>
        <p className="mt-1 text-[13px] text-[#86868b]">
          投稿の成功・失敗をDiscordに通知します
        </p>
        <div className="mt-6">
          <SettingsForm
            initialWebhookUrl={userData?.discord_webhook_url ?? ""}
          />
        </div>
      </div>
    </div>
  );
}
