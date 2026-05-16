import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/posts — list posts with pagination
// Query params: page, limit, status, account_id, date_from, date_to
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)),
  );
  const status = searchParams.get("status");
  const accountId = searchParams.get("account_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("posts")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status === "queued" || status === "posted" || status === "failed") {
    query = query.eq("status", status);
  }
  if (accountId) {
    query = query.eq("account_id", accountId);
  }
  if (dateFrom) {
    // Treat input as a JST calendar day; convert to UTC bound.
    const d = new Date(`${dateFrom}T00:00:00+09:00`);
    if (!Number.isNaN(d.getTime())) {
      query = query.gte("created_at", d.toISOString());
    }
  }
  if (dateTo) {
    // Inclusive end-of-day in JST.
    const d = new Date(`${dateTo}T23:59:59.999+09:00`);
    if (!Number.isNaN(d.getTime())) {
      query = query.lte("created_at", d.toISOString());
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    pagination: {
      page,
      limit,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / limit),
    },
  });
}
