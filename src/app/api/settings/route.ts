import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/settings — get user settings (from users table)
// ---------------------------------------------------------------------------
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, email, plan, discord_webhook_url, discord_user_id, is_active, created_at")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also fetch current plan limits
  const { data: planLimit } = await supabase
    .from("plan_limits")
    .select("*")
    .eq("plan", data.plan)
    .single();

  return NextResponse.json({ ...data, plan_limits: planLimit });
}

// ---------------------------------------------------------------------------
// PUT /api/settings — update user settings
// ---------------------------------------------------------------------------
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only allow updating discord_webhook_url for now
  const updates: Record<string, unknown> = {};

  if (body.discord_webhook_url !== undefined) {
    const webhookUrl = body.discord_webhook_url;
    if (
      webhookUrl !== null &&
      typeof webhookUrl === "string" &&
      webhookUrl.length > 0
    ) {
      try {
        const u = new URL(webhookUrl);
        if (u.protocol !== "https:") throw new Error();
        if (u.hostname !== "discord.com" && u.hostname !== "discordapp.com")
          throw new Error();
        if (u.username || u.password) throw new Error();
        if (!u.pathname.startsWith("/api/webhooks/")) throw new Error();
      } catch {
        return NextResponse.json(
          { error: "無効なWebhook URLです" },
          { status: 400 },
        );
      }
    }
    updates.discord_webhook_url =
      webhookUrl === "" || webhookUrl === null ? null : webhookUrl;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", user.id)
    .select("id, email, plan, discord_webhook_url, discord_user_id, is_active, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
