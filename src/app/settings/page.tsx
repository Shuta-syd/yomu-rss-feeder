"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

interface Settings {
  hasGeminiApiKey: boolean;
  geminiModelStage1: string;
  geminiModelStage2: string;
  theme: "light" | "dark" | "system";
  autoMarkAsRead: boolean;
}

const AVAILABLE_MODELS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (r.status === 401) {
          router.replace("/login");
          return null;
        }
        return r.json();
      })
      .then((d) => d && setSettings(d));
  }, [router]);

  if (!settings) return <p className="p-6 text-sm">Loading...</p>;

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    const body: Record<string, unknown> = {
      geminiModelStage1: settings.geminiModelStage1,
      geminiModelStage2: settings.geminiModelStage2,
      autoMarkAsRead: settings.autoMarkAsRead,
    };
    if (apiKey) body["geminiApiKey"] = apiKey;
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setSettings(await res.json());
      setApiKey("");
      setMessage("保存しました");
    } else {
      setMessage("保存失敗");
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">設定</h1>
        <div className="flex gap-2">
          <ThemeToggle />
          <a
            href="/feeds"
            className="rounded px-2 py-1 text-xs"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          >
            戻る
          </a>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Gemini API Key</label>
          <input
            type="password"
            placeholder={
              settings.hasGeminiApiKey ? "(設定済み) 変更する場合のみ入力" : "未設定"
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded border px-3 py-2"
            style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Stage1 モデル</label>
            <select
              value={settings.geminiModelStage1}
              onChange={(e) =>
                setSettings({ ...settings, geminiModelStage1: e.target.value })
              }
              className="w-full rounded border px-3 py-2"
              style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Stage2 モデル</label>
            <select
              value={settings.geminiModelStage2}
              onChange={(e) =>
                setSettings({ ...settings, geminiModelStage2: e.target.value })
              }
              className="w-full rounded border px-3 py-2"
              style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.autoMarkAsRead}
            onChange={(e) =>
              setSettings({ ...settings, autoMarkAsRead: e.target.checked })
            }
          />
          記事を開いたら自動的に既読にする
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {saving ? "保存中..." : "保存"}
          </button>
          {message && <span className="text-sm" style={{ color: "var(--muted)" }}>{message}</span>}
        </div>
      </section>
    </main>
  );
}
