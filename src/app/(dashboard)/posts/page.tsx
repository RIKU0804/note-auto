import { createClient } from "@/lib/supabase/server";
import type { Account, Post } from "@/types/database";
import PostList from "./PostList";

export default async function PostsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [accountsRes, postsRes] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name"),
    supabase
      .from("posts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(0, 9),
  ]);

  const { count } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const accounts: Pick<Account, "id" | "name">[] = accountsRes.data ?? [];
  const posts: Post[] = postsRes.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ color: '#26251e', letterSpacing: '-0.03em' }}
        >
          投稿一覧
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: 'rgba(38, 37, 30, 0.72)' }}
        >
          すべての投稿履歴を確認・管理
        </p>
      </div>

      <PostList
        initialPosts={posts}
        accounts={accounts}
        totalCount={count ?? 0}
      />
    </div>
  );
}
