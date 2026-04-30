import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { PLAN_LIMITS, type Cycle } from "@/types/database";

// ---------------------------------------------------------------------------
// GET /api/cron/cycle — Vercel Cron-compatible cycle trigger
//
// Vercel Cron always sends GET requests with the CRON_SECRET as a Bearer
// token in the Authorization header.  This endpoint uses the service-role
// key (not the anon key) so it can iterate over all active users
// regardless of RLS.
// ---------------------------------------------------------------------------

function getCycleForHour(hour: number): Cycle | null {
  // JST-based cycle mapping
  if (hour >= 6 && hour < 10) return "morning";
  if (hour >= 19 && hour < 23) return "night";
  return null;
}

function isCycle(value: string | null): value is Cycle {
  return value === "morning" || value === "night";
}

async function handle(request: NextRequest) {
  // --- Verify CRON_SECRET (timing-safe) ---
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(authHeader?.replace("Bearer ", "") ?? "");
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Determine current cycle ---
  // Query param is the source of truth; fall back to JST-hour derivation.
  const cycleParam = request.nextUrl.searchParams.get("cycle");
  const jstHourStr = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Tokyo",
    hour: "numeric",
    hour12: false,
  });
  const hour = parseInt(jstHourStr, 10);

  let cycle: Cycle | null;
  if (cycleParam !== null) {
    if (!isCycle(cycleParam)) {
      return NextResponse.json(
        { error: `Invalid cycle parameter: ${cycleParam}` },
        { status: 400 },
      );
    }
    cycle = cycleParam;
  } else {
    cycle = getCycleForHour(hour);
  }

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
    skipped?: string;
    error?: string;
  }> = [];

  for (const user of users ?? []) {
    try {
      // Respect plan cycle limits — skip users whose plan does not
      // include the requested cycle (e.g. free plan = morning only).
      const planKey = user.plan as keyof typeof PLAN_LIMITS;
      const planLimits = PLAN_LIMITS[planKey];
      if (!planLimits || !planLimits.cycles.includes(cycle)) {
        results.push({
          user_id: user.id,
          accounts_triggered: 0,
          skipped: `plan "${user.plan}" does not include cycle "${cycle}"`,
        });
        continue;
      }

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

      // Create queued posts for each active account.
      // tweet_text is NOT NULL in the schema; write a placeholder that
      // the worker overwrites once generation completes.
      const posts = accounts.map((account) => ({
        user_id: user.id,
        account_id: account.id,
        cycle,
        tweet_text: "(生成待ち)",
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

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
