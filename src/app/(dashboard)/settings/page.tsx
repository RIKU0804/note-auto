import { createClient } from "@/lib/supabase/server";
import type { User } from "@/types/database";
import { PLAN_LIMITS } from "@/types/database";
import { Crown } from "lucide-react";
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          設定
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          アカウント設定と通知の管理
        </p>
      </div>

      {/* Current plan */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-yellow-50 p-2.5 dark:bg-yellow-900/30">
            <Crown className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              現在のプラン
            </h2>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {Object.values(PLAN_LIMITS).map((p) => (
            <div
              key={p.plan}
              className={`rounded-lg border p-4 ${
                p.plan === plan
                  ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {p.label}
                </h3>
                {p.plan === plan && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                    現在
                  </span>
                )}
              </div>
              <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
                {p.price}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                最大 {p.max_accounts} アカウント
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Discord Webhook settings */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Discord 通知設定
        </h2>
        <SettingsForm
          initialWebhookUrl={userData?.discord_webhook_url ?? ""}
        />
      </div>
    </div>
  );
}
