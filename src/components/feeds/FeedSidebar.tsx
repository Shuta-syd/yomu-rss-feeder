"use client";

import type { FeedWithUnread } from "@/types/feed";
import type { SavedSiteDTO } from "@/types/site";
import { useState, useRef, useEffect, useMemo } from "react";
import { FeedIcon } from "./FeedIcon";

interface Props {
  feeds: FeedWithUnread[];
  sites: SavedSiteDTO[];
  selectedFeedId: string | null;
  selectedCategory: string | null;
  onSelect: (feedId: string | null) => void;
  onSelectCategory: (category: string) => void;
  onAddFeed: () => void;
  onSitesChanged: () => void;
  onSync: () => void;
  syncing: boolean;
  onLogout: () => void;
  onFeedMoved?: () => void;
  onFeedsDeleted?: () => void;
  onCategoryRenamed?: (oldName: string, newName: string) => void;
  isMobile?: boolean;
  onCollapse?: () => void;
  view?: "feeds" | "starred";
  onSelectStarred?: () => void;
}

function formatFeedFetchFailure(feed: FeedWithUnread): string {
  const count = `${feed.consecutiveFetchFailures}回連続`;
  const error = feed.lastFetchError?.trim();
  return error ? `取得失敗 (${count}): ${error}` : `取得失敗 (${count})`;
}

function SavedSitesBlock({
  sites,
  onSitesChanged,
}: {
  sites: SavedSiteDTO[];
  onSitesChanged: () => void;
}) {
  const [siteUrl, setSiteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trimmedUrl = siteUrl.trim();

  async function addSite(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmedUrl || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });
      if (res.ok) {
        setSiteUrl("");
        onSitesChanged();
        return;
      }
      if (res.status === 409) setError("このサイトは既に登録されています");
      else if (res.status === 400) setError("URLを確認してください");
      else setError("サイトの追加に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function deleteSite(site: SavedSiteDTO) {
    if (!confirm(`${site.title} を削除します。よろしいですか？`)) return;
    setDeletingId(site.id);
    try {
      const res = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
      if (res.ok) onSitesChanged();
      else setError("サイトの削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-2 space-y-1">
      <form onSubmit={addSite} className="flex gap-1 px-2 py-1">
        <input
          type="url"
          placeholder="サイトURL"
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          className="min-w-0 flex-1 rounded px-2 py-1 text-xs"
          style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
        />
        <button
          type="submit"
          disabled={loading || !trimmedUrl}
          className="shrink-0 rounded px-2 py-1 text-xs disabled:opacity-40"
          style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
        >
          {loading ? "…" : "追加"}
        </button>
      </form>
      <div className="grid gap-1">
        {sites.map((site) => (
          <div key={site.id} className="group/site flex min-w-0 items-center gap-1">
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--accent-subtle)]"
              title={site.url}
            >
              <FeedIcon url={site.faviconUrl} title={site.title} />
              <span className="min-w-0 flex-1 truncate">{site.title}</span>
            </a>
            <button
              type="button"
              onClick={() => deleteSite(site)}
              disabled={deletingId === site.id}
              className="shrink-0 rounded px-1 text-xs opacity-50 transition-opacity hover:opacity-100 disabled:opacity-30 md:opacity-0 md:group-hover/site:opacity-70 md:hover:opacity-100"
              title="削除"
              aria-label={`${site.title}を削除`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {error && (
        <p className="mt-1.5 px-2 text-xs leading-relaxed" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
    </section>
  );
}

export function FeedSidebar({
  feeds,
  sites,
  selectedFeedId,
  selectedCategory,
  onSelect,
  onSelectCategory,
  onAddFeed,
  onSitesChanged,
  onSync,
  syncing,
  onLogout,
  onFeedMoved,
  onFeedsDeleted,
  onCategoryRenamed,
  isMobile,
  onCollapse,
  view = "feeds",
  onSelectStarred,
}: Props) {
  const grouped = feeds.reduce<Record<string, FeedWithUnread[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});
  const categories = Object.keys(grouped).sort();
  const totalUnread = feeds.reduce((n, f) => n + (f.unreadCount ?? 0), 0);

  const [dragFeedId, setDragFeedId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const allFeedIds = useMemo(() => feeds.map((f) => f.id), [feeds]);
  const allSelected = selectedIds.size > 0 && selectedIds.size === allFeedIds.length;

  function enterSelectMode() {
    setSelectMode(true);
    setSelectedIds(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(cat: string) {
    const ids = grouped[cat]!.map((f) => f.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === allFeedIds.length ? new Set() : new Set(allFeedIds),
    );
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`${ids.length}件のフィードを削除します。記事も全て消えます。よろしいですか？`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/feeds", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        alert("削除に失敗しました");
        return;
      }
      exitSelectMode();
      onFeedsDeleted?.();
    } finally {
      setDeleting(false);
    }
  }

  async function moveFeedToCategory(feedId: string, newCategory: string) {
    const res = await fetch(`/api/feeds/${feedId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: newCategory }),
    });
    if (res.ok) onFeedMoved?.();
  }

  async function renameCategory(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (oldName === trimmed || !trimmed) return;
    const res = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldName, newName: trimmed }),
    });
    if (res.ok) {
      onFeedMoved?.();
      onCategoryRenamed?.(oldName, trimmed);
    }
  }

  return (
    <aside
      className={`flex h-full flex-col border-r ${isMobile ? "w-full" : "w-64 shrink-0"}`}
      style={{ background: "var(--sidebar-bg)", borderColor: "var(--card-border)" }}
      aria-label="フィード一覧"
    >
      <div className="flex items-center justify-between border-b p-3" style={{ borderColor: "var(--card-border)" }}>
        <h1 className="flex items-center gap-1.5 font-semibold">
          <img src="/icons/icon.svg" alt="" className="h-5 w-5 rounded" />
          <span>Yomu</span>
        </h1>
        <div className="flex gap-1">
          {!selectMode && (
            <>
              <button
                onClick={enterSelectMode}
                className="rounded px-2 py-1 text-xs"
                style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
                title="フィードを選択して一括削除"
              >
                ☑
              </button>
              <button
                onClick={onSync}
                disabled={syncing}
                className="rounded px-2 py-1 text-xs"
                style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
              >
                {syncing ? "..." : "↻"}
              </button>
              <button
                onClick={onLogout}
                className="rounded px-2 py-1 text-xs"
                style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
                title="Logout"
              >
                ⎋
              </button>
            </>
          )}
          {selectMode && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              選択モード
            </span>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              data-sidebar-close
              className="rounded px-2 py-1 text-xs"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
              title="フィード一覧を閉じる"
              aria-label="フィード一覧を閉じる"
              aria-controls="feed-sidebar-panel"
              aria-expanded="true"
            >
              ‹
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 text-sm" aria-label="フィードとカテゴリ">
        {selectMode ? (
          <label className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-3.5 w-3.5"
            />
            <span>全選択</span>
            <span className="ml-auto" style={{ color: "var(--muted)" }}>
              {selectedIds.size}/{allFeedIds.length}
            </span>
          </label>
        ) : (
          <>
            <button
              onClick={() => onSelect(null)}
              className="flex w-full items-center justify-between rounded px-2 py-1"
              style={{
                background:
                  view === "feeds" &&
                  selectedFeedId === null &&
                  selectedCategory === null
                    ? "var(--accent-subtle)"
                    : "transparent",
              }}
            >
              <span>すべて</span>
              <span style={{ color: "var(--muted)" }}>{totalUnread}</span>
            </button>
            <button
              onClick={() => onSelectStarred?.()}
              className="flex w-full items-center gap-2 rounded px-2 py-1"
              style={{
                background:
                  view === "starred" ? "var(--accent-subtle)" : "transparent",
                color: view === "starred" ? "inherit" : "var(--muted)",
              }}
            >
              <span className="text-yellow-500">★</span>
              <span>お気に入り</span>
            </button>
            <SavedSitesBlock sites={sites} onSitesChanged={onSitesChanged} />
          </>
        )}
        {categories.map((cat) => (
          <CategoryGroup
            key={cat}
            category={cat}
            feeds={grouped[cat]!}
            selectedFeedId={selectedFeedId}
            selectedCategory={selectedCategory}
            onSelect={onSelect}
            onSelectCategory={onSelectCategory}
            dragFeedId={dragFeedId}
            onDragStart={setDragFeedId}
            onDrop={moveFeedToCategory}
            onRename={renameCategory}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleFeed={toggleOne}
            onToggleCategory={toggleCategory}
          />
        ))}
      </nav>

      <div className="border-t p-2" style={{ borderColor: "var(--card-border)" }}>
        {selectMode ? (
          <div className="flex gap-2">
            <button
              onClick={exitSelectMode}
              disabled={deleting}
              className="flex-1 rounded px-2 py-1 text-xs disabled:opacity-50"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
            >
              キャンセル
            </button>
            <button
              onClick={deleteSelected}
              disabled={deleting || selectedIds.size === 0}
              className="flex-1 rounded px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: "#dc2626" }}
            >
              {deleting ? "削除中..." : `削除 (${selectedIds.size})`}
            </button>
          </div>
        ) : (
          <button
            onClick={onAddFeed}
            className="w-full rounded px-2 py-1 text-xs"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          >
            + フィード追加
          </button>
        )}
      </div>
    </aside>
  );
}

function CategoryGroup({
  category,
  feeds,
  selectedFeedId,
  selectedCategory,
  onSelect,
  onSelectCategory,
  dragFeedId,
  onDragStart,
  onDrop,
  onRename,
  selectMode,
  selectedIds,
  onToggleFeed,
  onToggleCategory,
}: {
  category: string;
  feeds: FeedWithUnread[];
  selectedFeedId: string | null;
  selectedCategory: string | null;
  onSelect: (id: string | null) => void;
  onSelectCategory: (category: string) => void;
  dragFeedId: string | null;
  onDragStart: (id: string | null) => void;
  onDrop: (feedId: string, category: string) => void;
  onRename: (oldName: string, newName: string) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleFeed: (id: string) => void;
  onToggleCategory: (category: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [dropTarget, setDropTarget] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(category);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const catAllChecked = selectMode && feeds.every((f) => selectedIds.has(f.id));
  const catSomeChecked = selectMode && !catAllChecked && feeds.some((f) => selectedIds.has(f.id));
  const unreadTotal = feeds.reduce((n, f) => n + (f.unreadCount ?? 0), 0);
  const isSelected = !selectMode && selectedCategory === category;

  function handleDragOver(e: React.DragEvent) {
    if (selectMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(true);
  }

  function handleDragLeave() {
    setDropTarget(false);
  }

  function handleDrop(e: React.DragEvent) {
    if (selectMode) return;
    e.preventDefault();
    setDropTarget(false);
    if (dragFeedId) {
      onDrop(dragFeedId, category);
      onDragStart(null);
    }
  }

  function commitRename() {
    setEditing(false);
    if (editValue.trim() && editValue.trim() !== category) {
      onRename(category, editValue.trim());
    } else {
      setEditValue(category);
    }
  }

  return (
    <div
      className="group/cat mt-3 rounded border-t pt-2 transition-colors"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        background: dropTarget
          ? "var(--accent-subtle)"
          : isSelected
            ? "var(--accent-subtle)"
            : "transparent",
        outline: dropTarget ? "2px dashed var(--accent)" : "none",
        outlineOffset: "-2px",
        borderColor: "var(--card-border)",
      }}
    >
      {selectMode ? (
        <label className="flex cursor-pointer items-center gap-2 px-2 text-xs uppercase" style={{ color: "var(--muted)" }}>
          <input
            type="checkbox"
            checked={catAllChecked}
            ref={(el) => { if (el) el.indeterminate = catSomeChecked; }}
            onChange={() => onToggleCategory(category)}
            className="h-3.5 w-3.5"
          />
          <span>{category}</span>
        </label>
      ) : editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setEditValue(category); setEditing(false); }
          }}
          className="mx-2 w-[calc(100%-16px)] rounded border px-1 py-0.5 text-xs"
          style={{ borderColor: "var(--accent)", background: "var(--card)" }}
        />
      ) : (
        <div className="flex items-center px-2 text-xs uppercase" style={{ color: "var(--muted)" }}>
          <button
            onClick={() => onSelectCategory(category)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            title="クリックでカテゴリ全体を表示"
          >
            <span className="truncate">{category}</span>
            {unreadTotal > 0 && (
              <span className="shrink-0 normal-case" style={{ color: "var(--muted)" }}>
                {unreadTotal}
              </span>
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="ml-1 shrink-0 rounded px-1 opacity-0 transition-opacity group-hover/cat:opacity-100"
            title="名前を変更"
            aria-label="カテゴリ名を変更"
          >
            ✎
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
            className="ml-1 shrink-0 rounded px-1"
            aria-label={open ? "折りたたむ" : "展開する"}
          >
            {open ? "▾" : "▸"}
          </button>
        </div>
      )}
      {(open || selectMode) && (
        <div className="mt-1">
          {feeds.map((f) => {
            const checked = selectedIds.has(f.id);
            return (
              <button
                key={f.id}
                draggable={!selectMode}
                onDragStart={(e) => {
                  if (selectMode) return;
                  onDragStart(f.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", f.id);
                }}
                onDragEnd={() => onDragStart(null)}
                onClick={() => (selectMode ? onToggleFeed(f.id) : onSelect(f.id))}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left ${
                  selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                }`}
                style={{
                  background:
                    selectMode && checked
                      ? "var(--accent-subtle)"
                      : !selectMode && selectedFeedId === f.id
                        ? "var(--accent-subtle)"
                        : "transparent",
                }}
              >
                {selectMode ? (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleFeed(f.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                ) : (
                  <FeedIcon url={f.faviconUrl} title={f.title} />
                )}
                <span className="min-w-0 flex-1 truncate">{f.title}</span>
                {!selectMode && f.consecutiveFetchFailures >= 3 && (
                  <span
                    className="shrink-0 text-xs text-yellow-500"
                    title={formatFeedFetchFailure(f)}
                    aria-label={formatFeedFetchFailure(f)}
                  >
                    ⚠
                  </span>
                )}
                {!selectMode && f.unreadCount > 0 && (
                  <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                    {f.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
