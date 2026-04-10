import { createClient } from "@/lib/supabase/server";
import type { Account } from "@/types/database";
import { GENRES } from "@/types/database";
import AccountList from "./AccountList";

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const accounts: Account[] = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: '#26251e', letterSpacing: '-0.03em' }}
          >
            アカウント管理
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: 'rgba(38, 37, 30, 0.72)' }}
          >
            X / note アカウントの追加・編集・管理
          </p>
        </div>
      </div>

      <AccountList initialAccounts={accounts} genres={[...GENRES]} />
    </div>
  );
}
