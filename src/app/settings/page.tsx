"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type ProviderType = "gemini" | "openai" | "anthropic";
type TabKey = "ai" | "notification" | "integration" | "account";

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

function detectProvider(model: string): ProviderType {
  if (model.startsWith("gemini")) return "gemini";
  if (model.startsWith("claude")) return "anthropic";
  return "openai";
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "ai", label: "AI" },
  { key: "notification", label: "通知" },
  { key: "integration", label: "連携" },
  { key: "account", label: "アカウント" },
];

interface ToastProps {
  message: string | null;
}

function Toast({ message }: ToastProps) {
  if (!message) return null;
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded px-4 py-2 text-sm shadow-lg transition-opacity"
      style={{
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        color: "var(--fg)",
      }}
      role="status"
    >
      {message}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("ai");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [xClientId, setXClientId] = useState("");
  const [xConnected, setXConnected] = useState(false);
  const [xHasClientId, setXHasClientId] = useState(false);
  const [xSaving, setXSaving] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);

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

    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      });
    }

    fetch("/api/x/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setXConnected(d.connected);
          setXHasClientId(d.hasClientId);
        }
      });
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  if (!settings) return <p className="p-6 text-sm">Loading...</p>;

  async function saveAI() {
    if (!settings) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      stage1Provider: settings.stage1Provider,
      stage2Provider: settings.stage2Provider,
      geminiModelStage1: settings.geminiModelStage1,
      geminiModelStage2: settings.geminiModelStage2,
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
      setToast("保存しました");
    } else {
      setToast("保存失敗");
    }
  }

  async function saveNotification() {
    if (!settings) return;
    setNotifSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoMarkAsRead: settings.autoMarkAsRead }),
    });
    setNotifSaving(false);
    if (res.ok) {
      setSettings(await res.json());
      setToast("保存しました");
    } else {
      setToast("保存失敗");
    }
  }

  async function togglePush() {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        }
        setPushEnabled(false);
        setToast("通知を無効にしました");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setToast("通知の許可が必要です");
          setPushLoading(false);
          return;
        }
        const vapidRes = await fetch("/api/push/vapid");
        const { publicKey } = await vapidRes.json();
        if (!publicKey) {
          setToast("VAPID鍵が未設定です");
          setPushLoading(false);
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
        const json = sub.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          }),
        });
        setPushEnabled(true);
        setToast("通知を有効にしました");
      }
    } catch (e) {
      setToast("エラーが発生しました");
      console.error(e);
    }
    setPushLoading(false);
  }

  async function saveXClientId() {
    if (!xClientId) return;
    setXSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xClientId }),
    });
    setXSaving(false);
    if (res.ok) {
      setXClientId("");
      setXHasClientId(true);
      setToast("Client ID を保存しました");
    } else {
      setToast("保存失敗");
    }
  }

  async function disconnectX() {
    setXSaving(true);
    const res = await fetch("/api/x/disconnect", { method: "POST" });
    setXSaving(false);
    if (res.ok) {
      setXConnected(false);
      setToast("連携を解除しました");
    } else {
      setToast("解除失敗");
    }
  }

  const inputStyle = { borderColor: "var(--card-border)", background: "var(--card)" };
  const inputCls = "w-full rounded border px-3 py-2";
  const labelCls = "mb-1.5 block text-sm font-medium";
  const sectionTitleCls = "text-base font-semibold";
  const primaryBtnCls = "rounded px-4 py-2 text-sm font-medium disabled:opacity-50";
  const primaryBtnStyle = { background: "var(--accent)", color: "var(--accent-fg)" };

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

      {/* タブバー */}
      <div
        className="flex gap-1 border-b"
        style={{ borderColor: "var(--card-border)" }}
        role="tablist"
      >
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(t.key)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                active ? "" : "border-transparent"
              }`}
              style={{
                borderColor: active ? "var(--accent)" : "transparent",
                color: active ? "var(--accent)" : "var(--muted)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* AIタブ */}
      {activeTab === "ai" && (
        <section className="mt-6 space-y-4">
          <div className="space-y-3">
            <h2 className={sectionTitleCls}>API Keys</h2>
            <div>
              <label className={labelCls}>Gemini API Key</label>
              <input
                type="password"
                placeholder={settings.hasGeminiApiKey ? "(設定済み) 変更する場合のみ入力" : "未設定"}
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelCls}>OpenAI API Key</label>
              <input
                type="password"
                placeholder={settings.hasOpenaiApiKey ? "(設定済み) 変更する場合のみ入力" : "未設定"}
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div>
              <label className={labelCls}>Anthropic API Key</label>
              <input
                type="password"
                placeholder={settings.hasAnthropicApiKey ? "(設定済み) 変更する場合のみ入力" : "未設定"}
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className={sectionTitleCls}>要約モデル</h2>

            <div>
              <div className="mb-1.5 text-sm font-medium" style={{ color: "var(--muted)" }}>
                自動要約
              </div>
              <select
                value={settings.geminiModelStage1}
                onChange={(e) => {
                  const model = e.target.value;
                  setSettings({ ...settings, geminiModelStage1: model, stage1Provider: detectProvider(model) });
                }}
                className={inputCls}
                style={inputStyle}
                aria-label="自動要約モデル"
              >
                {(Object.keys(PROVIDER_MODELS) as ProviderType[]).map((p) => (
                  <optgroup key={p} label={PROVIDER_LABELS[p]}>
                    {PROVIDER_MODELS[p].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1.5 text-sm font-medium" style={{ color: "var(--muted)" }}>
                詳細分析
              </div>
              <select
                value={settings.geminiModelStage2}
                onChange={(e) => {
                  const model = e.target.value;
                  setSettings({ ...settings, geminiModelStage2: model, stage2Provider: detectProvider(model) });
                }}
                className={inputCls}
                style={inputStyle}
                aria-label="詳細分析モデル"
              >
                {(Object.keys(PROVIDER_MODELS) as ProviderType[]).map((p) => (
                  <optgroup key={p} label={PROVIDER_LABELS[p]}>
                    {PROVIDER_MODELS[p].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div>
            <button
              onClick={saveAI}
              disabled={saving}
              className={primaryBtnCls}
              style={primaryBtnStyle}
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </section>
      )}

      {/* 通知タブ */}
      {activeTab === "notification" && (
        <section className="mt-6 space-y-4">
          <div className="space-y-3">
            <h2 className={sectionTitleCls}>プッシュ通知</h2>
            {pushSupported ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  disabled={pushLoading}
                  onChange={togglePush}
                />
                プッシュ通知を有効にする
                {pushLoading && (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>処理中...</span>
                )}
              </label>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                このブラウザはプッシュ通知に対応していません
              </p>
            )}
          </div>

          <div className="space-y-3">
            <h2 className={sectionTitleCls}>既読</h2>
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
          </div>

          <div>
            <button
              onClick={saveNotification}
              disabled={notifSaving}
              className={primaryBtnCls}
              style={primaryBtnStyle}
            >
              {notifSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </section>
      )}

      {/* 連携タブ */}
      {activeTab === "integration" && (
        <section className="mt-6 space-y-4">
          <div className="space-y-3">
            <h2 className={sectionTitleCls}>X (Twitter) 連携</h2>
            <div>
              <label className={labelCls}>X Client ID</label>
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
                  onClick={saveXClientId}
                  disabled={xSaving || !xClientId}
                  className={primaryBtnCls}
                  style={primaryBtnStyle}
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
                    onClick={disconnectX}
                    disabled={xSaving}
                    className="rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
                    style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
                  >
                    連携解除
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    if (!xHasClientId) return;
                    window.location.href = "/api/x/auth";
                  }}
                  disabled={!xHasClientId}
                  className={primaryBtnCls}
                  style={primaryBtnStyle}
                >
                  Xと連携する
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className={sectionTitleCls}>エクスポート</h2>
            <a
              href="/api/feeds/export"
              download="yomu-feeds.opml"
              className="inline-block rounded px-4 py-2 text-sm font-medium"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
            >
              OPMLエクスポート
            </a>
          </div>
        </section>
      )}

      {/* アカウントタブ */}
      {activeTab === "account" && (
        <section className="mt-6 space-y-4">
          <div className="space-y-3">
            <h2 className={sectionTitleCls}>テーマ</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                ライト / ダーク / システム
              </span>
              <ThemeToggle />
            </div>
          </div>

          {/*
            パスワード変更 (将来実装予定)
            <div className="space-y-3">
              <h2 className={sectionTitleCls}>パスワード変更</h2>
              ...
            </div>
          */}
        </section>
      )}

      <Toast message={toast} />
    </main>
  );
}
