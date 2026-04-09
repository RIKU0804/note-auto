import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/settings/test-webhook — send a test Discord notification
// Uses the same embed format as discord_notify.py
// ---------------------------------------------------------------------------
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch user's webhook URL
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("discord_webhook_url, email")
    .eq("id", user.id)
    .single();

  if (userError || !userRow) {
    return NextResponse.json(
      { error: "Could not fetch user settings" },
      { status: 500 },
    );
  }

  if (!userRow.discord_webhook_url) {
    return NextResponse.json(
      { error: "No Discord webhook URL configured" },
      { status: 400 },
    );
  }

  // Build test embed (matches discord_notify.py format)
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
    title: "テスト通知",
    description: [
      "これはテスト通知です。Webhook が正しく設定されています。",
      `**ユーザー**: ${userRow.email}`,
    ].join("\n"),
    color: 0x3498db,
    timestamp: new Date().toISOString(),
    footer: { text: `${nowJST} JST` },
  };

  try {
    const resp = await fetch(userRow.discord_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `Discord API error ${resp.status}: ${text}` },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, message: "Test notification sent" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to send webhook: ${message}` },
      { status: 502 },
    );
  }
}
