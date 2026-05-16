import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";

const SAFE_ACCOUNT_COLUMNS =
  "id, user_id, name, genre_id, x_username, post_interval_minutes, is_active, created_at" as const;

// Fields whose values must be encrypted before persisting.
const ENCRYPTED_FIELDS = new Set([
  "x_bearer_token",
  "x_api_key",
  "x_api_secret",
  "x_access_token",
  "x_access_token_secret",
  "x_password_enc",
]);

// ---------------------------------------------------------------------------
// PUT /api/accounts/[id] — update an account
// ---------------------------------------------------------------------------
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const allowedFields: Record<string, string> = {
    name: "name",
    genre_id: "genre_id",
    x_username: "x_username",
    x_password: "x_password_enc", // legacy Playwright path
    x_bearer_token: "x_bearer_token",
    x_api_key: "x_api_key",
    x_api_secret: "x_api_secret",
    x_access_token: "x_access_token",
    x_access_token_secret: "x_access_token_secret",
    post_interval_minutes: "post_interval_minutes",
    is_active: "is_active",
  };

  const updates: Record<string, unknown> = {};
  for (const [inputKey, dbColumn] of Object.entries(allowedFields)) {
    if (body[inputKey] === undefined) continue;
    const value = body[inputKey];
    if (ENCRYPTED_FIELDS.has(dbColumn) && typeof value === "string") {
      // Skip empty-string updates so "leave the token alone" is the default
      // when the form omits the field.
      if (value.length === 0) continue;
      updates[dbColumn] = encryptSecret(value);
    } else {
      updates[dbColumn] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("accounts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SAFE_ACCOUNT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ---------------------------------------------------------------------------
// DELETE /api/accounts/[id] — soft-delete (set is_active=false)
// ---------------------------------------------------------------------------
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
    .update({ is_active: false })
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SAFE_ACCOUNT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
