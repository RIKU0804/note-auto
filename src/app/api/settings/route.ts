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
    const url = body.discord_webhook_url;
    if (url !== null && typeof url === "string" && url.length > 0) {
      // Basic Discord webhook URL validation
      if (
        !url.startsWith("https://discord.com/api/webhooks/") &&
        !url.startsWith("https://discordapp.com/api/webhooks/")
      ) {
        return NextResponse.json(
          { error: "Invalid Discord webhook URL" },
          { status: 400 },
        );
      }
    }
    updates.discord_webhook_url = url === "" ? null : url;
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
