"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type ProviderType = "gemini" | "openai" | "anthropic";

interface Settings {
  hasGeminiApiKey: boolean;
  hasOpenaiApiKey: boolean;
  hasAnthropicApiKey: boolean;
  stage1Provider: ProviderType;
  stage2Provider: ProviderType;
  geminiModelStage1: string;
  geminiModelStage2: string;
  theme: "light" | "dark" | "system";
  autoMarkAsRead: boolean;
}

const PROVIDER_MODELS: Record<ProviderType, string[]> = {
  gemini: [
    "gemini-3-flash-preview",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "o4-mini",
  ],
  anthropic: [
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
  ],
};

const PROVIDER_LABELS: Record<ProviderType, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [xClientId, setXClientId] = useState("");
  const [xConnected, setXConnected] = useState(false);
  const [xHasClientId, setXHasClientId] = useState(false);
  const [xSaving, setXSaving] = useState(false);
  const [xMessage, setXMessage] = useState<string | null>(null);

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
    fetch("/api/x/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setXConnected(d.connected);
          setXHasClientId(d.hasClientId);
        }
      });
  }, [router]);

  if (!settings) return <p className="p-6 text-sm">Loading...</p>;

  function handleProviderChange(stage: "stage1Provider" | "stage2Provider", provider: ProviderType) {
    if (!settings) return;
    const modelKey = stage === "stage1Provider" ? "geminiModelStage1" : "geminiModelStage2";
    const models = PROVIDER_MODELS[provider];
    setSettings({
      ...settings,
      [stage]: provider,
      [modelKey]: models[0] ?? "",
    });
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    const body: Record<string, unknown> = {
      stage1Provider: settings.stage1Provider,
      stage2Provider: settings.stage2Provider,
      geminiModelStage1: settings.geminiModelStage1,
      geminiModelStage2: settings.geminiModelStage2,
      autoMarkAsRead: settings.autoMarkAsRead,
    };
    if (geminiApiKey) body["geminiApiKey"] = geminiApiKey;
    if (openaiApiKey) body["openaiApiKey"] = openaiApiKey;
    if (anthropicApiKey) body["anthropicApiKey"] = anthropicApiKey;
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setSettings(await res.json());
      setGeminiApiKey("");
      setOpenaiApiKey("");
      setAnthropicApiKey("");
      setMessage("保存しました");
    } else {
      setMessage("保存失敗");
    }
  }

  const inputStyle = { borderColor: "var(--card-border)", background: "var(--card)" };

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

      <section className="space-y-6">
        {/* API Keys */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium">API Keys</h2>
          <div>
            <label className="mb-1 block text-sm font-medium">Gemini API Key</label>
            <input
              type="password"
              placeholder={settings.hasGeminiApiKey ? "(設定済み) 変更する場合のみ入力" : "未設定"}
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              className="w-full rounded border px-3 py-2"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">OpenAI API Key</label>
            <input
              type="password"
              placeholder={settings.hasOpenaiApiKey ? "(設定済み) 変更する場合のみ入力" : "未設定"}
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              className="w-full rounded border px-3 py-2"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Anthropic API Key</label>
            <input
              type="password"
              placeholder={settings.hasAnthropicApiKey ? "(設定済み) 変更する場合のみ入力" : "未設定"}
              value={anthropicApiKey}
              onChange={(e) => setAnthropicApiKey(e.target.value)}
              className="w-full rounded border px-3 py-2"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Stage 1 */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Stage1 (自動要約)</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">プロバイダ</label>
              <select
                value={settings.stage1Provider}
                onChange={(e) => handleProviderChange("stage1Provider", e.target.value as ProviderType)}
                className="w-full rounded border px-3 py-2"
                style={inputStyle}
              >
                {(Object.keys(PROVIDER_LABELS) as ProviderType[]).map((p) => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">モデル</label>
              <select
                value={settings.geminiModelStage1}
                onChange={(e) => setSettings({ ...settings, geminiModelStage1: e.target.value })}
                className="w-full rounded border px-3 py-2"
                style={inputStyle}
              >
                {PROVIDER_MODELS[settings.stage1Provider].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Stage 2 */}
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Stage2 (詳細分析)</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">プロバイダ</label>
              <select
                value={settings.stage2Provider}
                onChange={(e) => handleProviderChange("stage2Provider", e.target.value as ProviderType)}
                className="w-full rounded border px-3 py-2"
                style={inputStyle}
              >
                {(Object.keys(PROVIDER_LABELS) as ProviderType[]).map((p) => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">モデル</label>
              <select
                value={settings.geminiModelStage2}
                onChange={(e) => setSettings({ ...settings, geminiModelStage2: e.target.value })}
                className="w-full rounded border px-3 py-2"
                style={inputStyle}
              >
                {PROVIDER_MODELS[settings.stage2Provider].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
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
          <a
            href="/api/feeds/export"
            download="yomu-feeds.opml"
            className="rounded px-4 py-2 text-sm font-medium"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          >
            OPMLエクスポート
          </a>
          {message && <span className="text-sm" style={{ color: "var(--muted)" }}>{message}</span>}
        </div>

        {/* X (Twitter) 連携 */}
        <div className="space-y-3 border-t pt-6" style={{ borderColor: "var(--card-border)" }}>
          <h2 className="text-lg font-medium">X (Twitter) 連携</h2>
          <div>
            <label className="mb-1 block text-sm font-medium">X Client ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={xHasClientId ? "(設定済み) 変更する場合のみ入力" : "未設定"}
                value={xClientId}
                onChange={(e) => setXClientId(e.target.value)}
                className="flex-1 rounded border px-3 py-2"
                style={inputStyle}
              />
              <button
                onClick={async () => {
                  if (!xClientId) return;
                  setXSaving(true);
                  setXMessage(null);
                  const res = await fetch("/api/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ xClientId }),
                  });
                  setXSaving(false);
                  if (res.ok) {
                    setXClientId("");
                    setXHasClientId(true);
                    setXMessage("Client ID を保存しました");
                  } else {
                    setXMessage("保存失敗");
                  }
                }}
                disabled={xSaving || !xClientId}
                className="rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                保存
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {xConnected ? (
              <>
                <span className="text-sm" style={{ color: "var(--muted)" }}>連携済み</span>
                <button
                  onClick={async () => {
                    setXSaving(true);
                    setXMessage(null);
                    const res = await fetch("/api/x/disconnect", { method: "POST" });
                    setXSaving(false);
                    if (res.ok) {
                      setXConnected(false);
                      setXMessage("連携を解除しました");
                    } else {
                      setXMessage("解除失敗");
                    }
                  }}
                  disabled={xSaving}
                  className="rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
                  style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
                >
                  連携解除
                </button>
              </>
            ) : (
              <a
                href="/api/x/auth"
                className={`rounded px-3 py-2 text-sm font-medium ${!xHasClientId ? "pointer-events-none opacity-50" : ""}`}
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                Xと連携する
              </a>
            )}
            {xMessage && <span className="text-sm" style={{ color: "var(--muted)" }}>{xMessage}</span>}
          </div>
        </div>
      </section>
    </main>
  );
}
