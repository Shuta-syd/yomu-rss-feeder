"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export function AddFeedDialog({ open, onClose, onAdded }: Props) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, category: category || undefined }),
    });
    setLoading(false);
    if (res.ok) {
      setUrl("");
      setCategory("");
      onAdded();
      onClose();
    } else if (res.status === 409) {
      setError("このフィードは既に登録されています");
    } else if (res.status === 422) {
      setError("フィードのパースに失敗しました");
    } else {
      setError("エラーが発生しました");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-lg p-6"
        style={{ background: "var(--bg)", border: "1px solid var(--card-border)" }}
      >
        <h2 className="text-lg font-semibold">フィード追加</h2>
        <input
          type="url"
          required
          placeholder="https://example.com/feed.xml"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded border px-3 py-2"
          style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
        />
        <input
          type="text"
          placeholder="カテゴリ (任意)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded border px-3 py-2"
          style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1 text-sm"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded px-3 py-1 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {loading ? "取得中..." : "追加"}
          </button>
        </div>
      </form>
    </div>
  );
}
