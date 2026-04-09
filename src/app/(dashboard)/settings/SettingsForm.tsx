"use client";

import { useState } from "react";
import { Send, Check } from "lucide-react";

export default function SettingsForm({
  initialWebhookUrl,
}: {
  initialWebhookUrl: string;
}) {
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discord_webhook_url: webhookUrl || null }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "保存に失敗しました");
      }

      setMessage({ type: "success", text: "設定を保存しました" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "エラーが発生しました",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!webhookUrl) {
      setMessage({ type: "error", text: "Webhook URLを入力してください" });
      return;
    }

    setTesting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discord_webhook_url: webhookUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "テスト送信に失敗しました");
      }

      setMessage({ type: "success", text: "テスト通知を送信しました" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "エラーが発生しました",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] ${
            message.type === "success"
              ? "bg-[#f0faf0] text-[#34c759]"
              : "bg-[#fff0f0] text-[#ff3b30]"
          }`}
        >
          {message.type === "success" && (
            <Check className="h-4 w-4" strokeWidth={2} />
          )}
          {message.text}
        </div>
      )}

      <div>
        <label className="block text-[12px] font-medium uppercase tracking-wider text-[#86868b] mb-1.5">
          Discord Webhook URL
        </label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full rounded-xl border border-[#e5e5e7] bg-[#fafafa] px-4 py-3 text-[14px] text-[#1d1d1f] outline-none transition-all duration-200 placeholder:text-[#aeaeb2] focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/10"
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[#0071e3] px-6 py-2.5 text-[13px] font-medium text-white transition-all duration-200 hover:bg-[#0077ed] active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !webhookUrl}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium text-[#86868b] ring-1 ring-[#e5e5e7] transition-all duration-200 hover:bg-[#f5f5f7] hover:text-[#1d1d1f] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="h-3.5 w-3.5" strokeWidth={1.8} />
          {testing ? "送信中..." : "テスト送信"}
        </button>
      </div>
    </form>
  );
}
