import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/accounts/[id]/toggle — toggle is_active (pause / resume)
// ---------------------------------------------------------------------------
export async function POST(
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

  // Fetch the current state (scoped to owner)
  const { data: account, error: fetchError } = await supabase
    .from("accounts")
    .select("id, is_active")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !account) {
    return NextResponse.json(
      { error: "Account not found" },
      { status: 404 },
    );
  }

  // Toggle with optimistic lock — the extra .eq("is_active", account.is_active)
  // guard ensures two concurrent requests cannot both flip to the same value.
  const { data, error } = await supabase
    .from("accounts")
    .update({ is_active: !account.is_active })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("is_active", account.is_active)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "Account state changed concurrently, please retry" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
