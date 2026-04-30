import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/accounts — list all accounts for the authenticated user
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
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// POST /api/accounts — create a new account
// ---------------------------------------------------------------------------
const REQUIRED_FIELDS = [
  "name",
  "genre_id",
  "x_username",
  "x_password",
] as const;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- parse & validate body ---
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const missing = REQUIRED_FIELDS.filter((f) => !body[f]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  // --- input validation ---
  for (const field of REQUIRED_FIELDS) {
    if (typeof body[field] !== "string") {
      return NextResponse.json(
        { error: `Field "${field}" must be a string` },
        { status: 400 },
      );
    }
  }
  const name = body.name as string;
  const genreId = body.genre_id as string;
  if (name.length === 0 || name.length > 100) {
    return NextResponse.json(
      { error: "name must be between 1 and 100 characters" },
      { status: 400 },
    );
  }
  if (genreId.length === 0 || genreId.length > 50) {
    return NextResponse.json(
      { error: "genre_id must be between 1 and 50 characters" },
      { status: 400 },
    );
  }
  if (
    body.post_interval_minutes !== undefined &&
    (typeof body.post_interval_minutes !== "number" ||
      !Number.isFinite(body.post_interval_minutes) ||
      body.post_interval_minutes < 1 ||
      body.post_interval_minutes > 1440)
  ) {
    return NextResponse.json(
      { error: "post_interval_minutes must be a number between 1 and 1440" },
      { status: 400 },
    );
  }

  // --- check plan limit ---
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("plan")
    .eq("id", user.id)
    .single();

  if (userError || !userRow) {
    return NextResponse.json(
      { error: "Could not fetch user plan" },
      { status: 500 },
    );
  }

  const { data: planLimit, error: planError } = await supabase
    .from("plan_limits")
    .select("max_accounts")
    .eq("plan", userRow.plan)
    .single();

  if (planError || !planLimit) {
    return NextResponse.json(
      { error: "Could not fetch plan limits" },
      { status: 500 },
    );
  }

  const { count, error: countError } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) {
    return NextResponse.json(
      { error: "Could not count existing accounts" },
      { status: 500 },
    );
  }

  if ((count ?? 0) >= planLimit.max_accounts) {
    return NextResponse.json(
      {
        error: `Account limit reached for "${userRow.plan}" plan (max ${planLimit.max_accounts})`,
      },
      { status: 403 },
    );
  }

  // --- insert ---
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      name: body.name as string,
      genre_id: body.genre_id as string,
      x_username: body.x_username as string,
      x_password_enc: body.x_password as string, // plain text for now — Vault later
      post_interval_minutes:
        typeof body.post_interval_minutes === "number"
          ? body.post_interval_minutes
          : 15,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
