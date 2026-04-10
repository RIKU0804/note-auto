import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// POST /api/posts/[id]/retry — retry a failed post (reset to 'queued')
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

  // Fetch the post to verify it is in "failed" status (scoped to owner)
  const { data: post, error: fetchError } = await supabase
    .from("posts")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.status !== "failed") {
    return NextResponse.json(
      { error: `Cannot retry a post with status "${post.status}". Only failed posts can be retried.` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("posts")
    .update({ status: "queued", error_message: null })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
