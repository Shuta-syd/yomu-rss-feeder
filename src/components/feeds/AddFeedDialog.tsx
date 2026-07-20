"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildExistingCategoryOptions,
  resolveAddFeedCategory,
  UNCATEGORIZED_CATEGORY,
  type AddFeedCategoryMode,
} from "@/lib/feed-categories";

interface Props {
  categories: string[];
  initialCategory?: string | null;
  onClose: () => void;
  onAdded: () => void;
}

export function AddFeedDialog({
  categories,
  initialCategory,
  onClose,
  onAdded,
}: Props) {
  const categoryOptions = buildExistingCategoryOptions(categories);
  const [url, setUrl] = useState("");
  const [categoryMode, setCategoryMode] = useState<AddFeedCategoryMode>("existing");
  const [existingCategory, setExistingCategory] = useState(() =>
    initialCategory && categoryOptions.includes(initialCategory)
      ? initialCategory
      : UNCATEGORIZED_CATEGORY,
  );
  const [newCategory, setNewCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const newCategoryRef = useRef<HTMLInputElement>(null);
  const resolvedCategory = resolveAddFeedCategory(
    categoryMode,
    existingCategory,
    newCategory,
  );
  const canSubmit = Boolean(url.trim()) && Boolean(resolvedCategory) && !loading;

  useEffect(() => {
    if (categoryMode !== "new") return;
    const frame = window.requestAnimationFrame(() => newCategoryRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [categoryMode]);

  useEffect(() => {
    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!loading) {
          event.preventDefault();
          onClose();
        }
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => document.removeEventListener("keydown", handleDialogKeyDown);
  }, [loading, onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !resolvedCategory) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), category: resolvedCategory }),
      });
      if (res.ok) {
        onAdded();
        onClose();
        return;
      }
      if (res.status === 409) {
        setError("このフィードは既に登録されています");
      } else if (res.status === 422) {
        setError("フィードのパースに失敗しました");
      } else {
        setError("エラーが発生しました");
      }
    } catch {
      setError("通信に失敗しました。時間をおいて再度お試しください");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => {
        if (!loading) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-feed-title"
    >
      <form
        ref={dialogRef}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="mx-4 w-full max-w-md space-y-4 rounded-lg p-6"
        style={{ background: "var(--bg)", border: "1px solid var(--card-border)" }}
        aria-busy={loading}
      >
        <h2 id="add-feed-title" className="text-lg font-semibold">フィード追加</h2>

        <div className="space-y-1.5">
          <label htmlFor="add-feed-url" className="block text-sm font-medium">
            フィードURL
          </label>
          <input
            id="add-feed-url"
            type="url"
            required
            autoFocus
            placeholder="https://example.com/feed.xml"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            className="w-full rounded border px-3 py-2"
            style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">カテゴリ</legend>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["existing", "既存から選ぶ"],
              ["new", "新規作成"],
            ] as const).map(([mode, label]) => (
              <label
                key={mode}
                className="flex cursor-pointer items-center justify-center gap-2 rounded border px-3 py-2 text-sm"
                style={{
                  borderColor:
                    categoryMode === mode ? "var(--accent)" : "var(--card-border)",
                  background:
                    categoryMode === mode ? "var(--accent-subtle)" : "var(--card)",
                }}
              >
                <input
                  type="radio"
                  name="add-feed-category-mode"
                  value={mode}
                  checked={categoryMode === mode}
                  onChange={() => setCategoryMode(mode)}
                  disabled={loading}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          {categoryMode === "existing" ? (
            <div className="space-y-1.5">
              <label htmlFor="add-feed-existing-category" className="sr-only">
                既存カテゴリ
              </label>
              <select
                id="add-feed-existing-category"
                value={existingCategory}
                onChange={(e) => setExistingCategory(e.target.value)}
                disabled={loading}
                className="w-full rounded border px-3 py-2"
                style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="add-feed-new-category" className="sr-only">
                新しいカテゴリ名
              </label>
              <input
                ref={newCategoryRef}
                id="add-feed-new-category"
                type="text"
                required
                maxLength={64}
                placeholder="新しいカテゴリ名"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                disabled={loading}
                className="w-full rounded border px-3 py-2"
                style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
              />
            </div>
          )}
        </fieldset>

        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded px-3 py-1 text-sm"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
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
