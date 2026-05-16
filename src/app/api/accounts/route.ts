import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";

// Columns that contain credentials and must never be returned to the browser.
const SAFE_ACCOUNT_COLUMNS =
  "id, user_id, name, genre_id, x_username, post_interval_minutes, is_active, created_at" as const;

// ---------------------------------------------------------------------------
// GET /api/accounts — list all accounts for the authenticated user
// (credentials stripped — see SAFE_ACCOUNT_COLUMNS)
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
    .select(SAFE_ACCOUNT_COLUMNS)
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
const REQUIRED_FIELDS = ["name", "genre_id", "x_username"] as const;
const OPTIONAL_STRING_FIELDS = [
  "x_bearer_token",
  "x_api_key",
  "x_api_secret",
  "x_access_token",
  "x_access_token_secret",
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

  for (const field of REQUIRED_FIELDS) {
    if (typeof body[field] !== "string") {
      return NextResponse.json(
        { error: `Field "${field}" must be a string` },
        { status: 400 },
      );
    }
  }
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (body[field] !== undefined && typeof body[field] !== "string") {
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

  // X API path requires the full OAuth 1.0a 4-tuple plus a Bearer Token for
  // tweet posting on Free tier. Bearer-only attempts return 403 from X, so we
  // reject them at the boundary instead of silently failing at post time.
  // The Playwright fallback (x_password) is accepted on its own.
  const apiCreds = [
    body.x_bearer_token,
    body.x_api_key,
    body.x_api_secret,
    body.x_access_token,
    body.x_access_token_secret,
  ];
  const apiCredsCount = apiCreds.filter(
    (v) => typeof v === "string" && v.length > 0,
  ).length;
  const hasApiSet = apiCredsCount === 5;
  const hasPassword =
    typeof body.x_password === "string" && body.x_password.length > 0;

  if (apiCredsCount > 0 && !hasApiSet) {
    return NextResponse.json(
      {
        error:
          "X API V2 credentials are incomplete. Provide all five: x_bearer_token, x_api_key, x_api_secret, x_access_token, x_access_token_secret.",
      },
      { status: 400 },
    );
  }
  if (!hasApiSet && !hasPassword) {
    return NextResponse.json(
      {
        error:
          "Provide the full X API V2 credential set (recommended) or x_password (legacy Playwright fallback).",
      },
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

  // --- plan limit check (active accounts only) ---
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
    .eq("user_id", user.id)
    .eq("is_active", true);

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

  // --- insert (credentials encrypted at rest) ---
  const insertRow: Record<string, unknown> = {
    user_id: user.id,
    name,
    genre_id: genreId,
    x_username: body.x_username as string,
    post_interval_minutes:
      typeof body.post_interval_minutes === "number"
        ? body.post_interval_minutes
        : 15,
  };
  if (typeof body.x_bearer_token === "string" && body.x_bearer_token.length > 0)
    insertRow.x_bearer_token = encryptSecret(body.x_bearer_token);
  if (typeof body.x_api_key === "string" && body.x_api_key.length > 0)
    insertRow.x_api_key = encryptSecret(body.x_api_key);
  if (typeof body.x_api_secret === "string" && body.x_api_secret.length > 0)
    insertRow.x_api_secret = encryptSecret(body.x_api_secret);
  if (typeof body.x_access_token === "string" && body.x_access_token.length > 0)
    insertRow.x_access_token = encryptSecret(body.x_access_token);
  if (
    typeof body.x_access_token_secret === "string" &&
    body.x_access_token_secret.length > 0
  )
    insertRow.x_access_token_secret = encryptSecret(body.x_access_token_secret);
  if (typeof body.x_password === "string" && body.x_password.length > 0)
    insertRow.x_password_enc = encryptSecret(body.x_password);

  const { data, error } = await supabase
    .from("accounts")
    .insert(insertRow)
    .select(SAFE_ACCOUNT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
