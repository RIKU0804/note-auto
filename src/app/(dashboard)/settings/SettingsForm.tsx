"use client";

import { useState } from "react";
import { Bell, Send, Check } from "lucide-react";

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
    <form onSubmit={handleSave} className="space-y-4">
      {message && (
        <div
          className="flex items-center gap-2 rounded-lg p-3 text-sm"
          style={{
            background: message.type === "success"
              ? 'rgba(31, 138, 101, 0.08)'
              : 'rgba(207, 45, 86, 0.08)',
            color: message.type === "success" ? '#1f8a65' : '#cf2d56',
          }}
        >
          {message.type === "success" && <Check className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <div>
        <label
          className="mb-1.5 flex items-center gap-2"
          style={{
            color: 'rgba(38, 37, 30, 0.55)',
            fontSize: '0.75rem',
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          <Bell className="h-4 w-4" />
          Discord Webhook URL
        </label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full px-3 py-2 text-sm outline-none transition-colors"
          style={{
            background: 'transparent',
            border: '1px solid rgba(38, 37, 30, 0.1)',
            color: '#26251e',
            borderRadius: '8px',
          }}
        />
        <p className="mt-1 text-xs" style={{ color: 'rgba(38, 37, 30, 0.4)' }}>
          投稿の成功・失敗をDiscordに通知します
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            background: '#ebeae5',
            color: '#26251e',
            border: '1px solid rgba(38, 37, 30, 0.1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#cf2d56'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#26251e'; }}
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !webhookUrl}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40"
          style={{
            background: 'transparent',
            color: 'rgba(38, 37, 30, 0.55)',
            border: '1px solid rgba(38, 37, 30, 0.1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#26251e'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(38, 37, 30, 0.55)'; }}
        >
          <Send className="h-4 w-4" />
          {testing ? "送信中..." : "テスト送信"}
        </button>
      </div>
    </form>
  );
}
