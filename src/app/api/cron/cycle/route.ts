import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// POST /api/cron/cycle — Vercel Cron-compatible cycle trigger
//
// This endpoint uses the service-role key (not the anon key) so it can
// iterate over all active users regardless of RLS.  It is protected by
// the CRON_SECRET header.
// ---------------------------------------------------------------------------

function getCycleForHour(hour: number): string | null {
  // JST-based cycle mapping
  if (hour >= 6 && hour < 10) return "morning";
  if (hour >= 11 && hour < 14) return "noon";
  if (hour >= 19 && hour < 23) return "night";
  return null;
}

export async function POST(request: NextRequest) {
  // --- Verify CRON_SECRET ---
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Determine current cycle ---
  const jstHour = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "numeric",
    hour12: false,
  });
  const hour = parseInt(jstHour, 10);
  const cycle = getCycleForHour(hour);

  if (!cycle) {
    return NextResponse.json({
      ok: true,
      message: `No cycle active at JST hour ${hour}. Skipping.`,
      processed: 0,
    });
  }

  // --- Use service role client to bypass RLS ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase service role configuration" },
      { status: 500 },
    );
  }

  const supabase = createServerClient(supabaseUrl, serviceRoleKey);

  // --- Fetch all active users ---
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, email, plan, discord_webhook_url")
    .eq("is_active", true);

  if (usersError) {
    return NextResponse.json(
      { error: `Failed to fetch users: ${usersError.message}` },
      { status: 500 },
    );
  }

  const results: Array<{
    user_id: string;
    accounts_triggered: number;
    error?: string;
  }> = [];

  for (const user of users ?? []) {
    try {
      // Fetch active accounts for this user
      const { data: accounts, error: accError } = await supabase
        .from("accounts")
        .select("id, name, genre_id")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (accError) {
        results.push({
          user_id: user.id,
          accounts_triggered: 0,
          error: accError.message,
        });
        continue;
      }

      if (!accounts || accounts.length === 0) {
        results.push({ user_id: user.id, accounts_triggered: 0 });
        continue;
      }

      // Create queued posts for each active account
      const posts = accounts.map((account) => ({
        user_id: user.id,
        account_id: account.id,
        cycle,
        title: `[${cycle}] ${account.name}`,
        content_free: "", // Will be populated by the worker
        content_paid: "", // Will be populated by the worker
        status: "queued",
      }));

      const { error: insertError } = await supabase
        .from("posts")
        .insert(posts);

      if (insertError) {
        results.push({
          user_id: user.id,
          accounts_triggered: 0,
          error: insertError.message,
        });
        continue;
      }

      // Send Discord notification if webhook is configured
      if (user.discord_webhook_url) {
        const nowJST = new Date().toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        const embed = {
          title: `サイクル開始: ${cycle}`,
          description: [
            `対象アカウント数: **${accounts.length}**`,
            `ユーザー: ${user.email}`,
          ].join("\n"),
          color: 0x3498db,
          timestamp: new Date().toISOString(),
          footer: { text: `${nowJST} JST` },
        };

        // Fire-and-forget — don't block the cron response
        fetch(user.discord_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [embed] }),
        }).catch(() => {
          /* ignore webhook errors */
        });
      }

      results.push({
        user_id: user.id,
        accounts_triggered: accounts.length,
      });
    } catch (err) {
      results.push({
        user_id: user.id,
        accounts_triggered: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    cycle,
    jst_hour: hour,
    processed: results.length,
    results,
  });
}
