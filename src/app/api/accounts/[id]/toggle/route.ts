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

  // Fetch the current state
  const { data: account, error: fetchError } = await supabase
    .from("accounts")
    .select("id, is_active")
    .eq("id", id)
    .single();

  if (fetchError || !account) {
    return NextResponse.json(
      { error: "Account not found" },
      { status: 404 },
    );
  }

  // Toggle
  const { data, error } = await supabase
    .from("accounts")
    .update({ is_active: !account.is_active })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
