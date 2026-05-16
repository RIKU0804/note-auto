import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { PLAN_LIMITS, type Cycle } from "@/types/database";

// ---------------------------------------------------------------------------
// GET/POST /api/cron/cycle
//
// Optional manual cycle trigger. The primary scheduler is the GitHub Actions
// Python worker (scripts/worker.py) — this endpoint exists so an operator
// can fan out a Discord "cycle starting" announcement on demand without
// duplicating any DB writes the worker is responsible for.
//
// Auth: Bearer token equal to env CRON_SECRET, compared in constant time
// using an HMAC of both values so neither length nor content leaks via
// timing.
// ---------------------------------------------------------------------------

function getCycleForHour(hour: number): Cycle | null {
  if (hour >= 6 && hour < 10) return "morning";
  if (hour >= 19 && hour < 23) return "night";
  return null;
}

function isCycle(value: string | null): value is Cycle {
  return value === "morning" || value === "night";
}

function constantTimeEqual(provided: string, expected: string): boolean {
  // Hash both sides with a per-request random key so that:
  //   1. the comparison runs over equal-length buffers (timingSafeEqual rule), and
  //   2. an attacker timing the request learns nothing about the secret's length.
  const key = crypto.randomBytes(32);
  const a = crypto.createHmac("sha256", key).update(provided).digest();
  const b = crypto.createHmac("sha256", key).update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!constantTimeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Resolve cycle from query or JST clock ---
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
      notified: 0,
    });
  }

  // --- service role client (RLS bypass) for cross-user iteration ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase service role configuration" },
      { status: 500 },
    );
  }

  const supabase = createServerClient(supabaseUrl, serviceRoleKey);

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
    notified: boolean;
    skipped?: string;
  }> = [];

  await Promise.all(
    (users ?? []).map(async (user) => {
      const planKey = user.plan as keyof typeof PLAN_LIMITS;
      const planLimits = PLAN_LIMITS[planKey];
      if (!planLimits || !planLimits.cycles.includes(cycle)) {
        results.push({
          user_id: user.id,
          notified: false,
          skipped: `plan "${user.plan}" does not include cycle "${cycle}"`,
        });
        return;
      }

      const { count } = await supabase
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (!user.discord_webhook_url || (count ?? 0) === 0) {
        results.push({ user_id: user.id, notified: false });
        return;
      }

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
        title: `サイクル開始通知: ${cycle}`,
        description: [
          `対象アカウント数: **${count ?? 0}**`,
          `ユーザー: ${user.email}`,
        ].join("\n"),
        color: 0x3498db,
        timestamp: new Date().toISOString(),
        footer: { text: `${nowJST} JST` },
      };

      try {
        await fetch(user.discord_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [embed] }),
        });
        results.push({ user_id: user.id, notified: true });
      } catch {
        results.push({ user_id: user.id, notified: false });
      }
    }),
  );

  return NextResponse.json({
    ok: true,
    cycle,
    jst_hour: hour,
    notified: results.filter((r) => r.notified).length,
    results,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
