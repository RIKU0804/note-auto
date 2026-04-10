export type User = {
  id: string;
  email: string;
  plan: "free" | "pro" | "business";
  discord_webhook_url: string | null;
  discord_user_id: string | null;
  is_active: boolean;
  created_at: string;
};

export type Account = {
  id: string;
  user_id: string;
  name: string;
  genre_id: string;
  note_email: string;
  x_username: string;
  post_interval_minutes: number;
  is_active: boolean;
  created_at: string;
};

export type Post = {
  id: string;
  user_id: string;
  account_id: string;
  cycle: "morning" | "noon" | "night";
  title: string;
  content_free: string;
  content_paid: string;
  note_price: number;
  note_url: string | null;
  x_tweet_id: string | null;
  status: "queued" | "posted" | "failed";
  error_message: string | null;
  posted_at: string | null;
  created_at: string;
};

export type Log = {
  id: string;
  user_id: string;
  account_id: string;
  action: string;
  message: string;
  level: "info" | "warn" | "error";
  created_at: string;
};

export type Cycle = "morning" | "noon" | "night";

export type PlanLimits = {
  plan: User["plan"];
  max_accounts: number;
  label: string;
  price: string;
  cycles: readonly Cycle[];
};

export const PLAN_LIMITS: Record<User["plan"], PlanLimits> = {
  free: {
    plan: "free",
    max_accounts: 1,
    label: "Free",
    price: "¥0/月",
    cycles: ["morning"] as const,
  },
  pro: {
    plan: "pro",
    max_accounts: 5,
    label: "Pro",
    price: "¥2,980/月",
    cycles: ["morning", "noon", "night"] as const,
  },
  business: {
    plan: "business",
    max_accounts: 20,
    label: "Business",
    price: "¥9,800/月",
    cycles: ["morning", "noon", "night"] as const,
  },
};

export const GENRES = [
  { id: "self-improvement", label: "自己啓発" },
  { id: "business", label: "ビジネス" },
  { id: "health", label: "健康・美容" },
  { id: "technology", label: "テクノロジー" },
] as const;
