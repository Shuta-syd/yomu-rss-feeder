"use client";

import type { FeedWithUnread } from "@/types/feed";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

interface Props {
  feeds: FeedWithUnread[];
  selectedFeedId: string | null;
  onSelect: (feedId: string | null) => void;
  onAddFeed: () => void;
  onSync: () => void;
  syncing: boolean;
  onLogout: () => void;
  onFeedMoved?: () => void;
  onFeedsDeleted?: () => void;
  isMobile?: boolean;
}

export function FeedSidebar({
  feeds,
  selectedFeedId,
  onSelect,
  onAddFeed,
  onSync,
  syncing,
  onLogout,
  onFeedMoved,
  onFeedsDeleted,
  isMobile,
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
    if (oldName === newName || !newName.trim()) return;
    const res = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldName, newName: newName.trim() }),
    });
    if (res.ok) onFeedMoved?.();
  }

  return (
    <aside
      className={`flex h-full flex-col border-r ${isMobile ? "w-full" : "w-64 shrink-0"}`}
      style={{ background: "var(--sidebar-bg)", borderColor: "var(--card-border)" }}
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
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 text-sm">
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
                background: selectedFeedId === null ? "var(--accent-subtle)" : "transparent",
              }}
            >
              <span>すべて</span>
              <span style={{ color: "var(--muted)" }}>{totalUnread}</span>
            </button>
            <a
              href="/x"
              className="flex w-full items-center gap-2 rounded px-2 py-1"
              style={{ color: "var(--muted)" }}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>いいね</span>
            </a>
          </>
        )}
        {categories.map((cat) => (
          <CategoryGroup
            key={cat}
            category={cat}
            feeds={grouped[cat]!}
            selectedFeedId={selectedFeedId}
            onSelect={onSelect}
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
  onSelect,
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
  onSelect: (id: string | null) => void;
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
      className="mt-3 rounded border-t pt-2 transition-colors"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        background: dropTarget ? "var(--accent-subtle)" : "transparent",
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
        <button
          onClick={() => setOpen(!open)}
          onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}
          className="flex w-full items-center justify-between px-2 text-xs uppercase"
          style={{ color: "var(--muted)" }}
          title="ダブルクリックで名前変更"
        >
          <span>{category}</span>
          <span>{open ? "▾" : "▸"}</span>
        </button>
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
                  <span className="shrink-0 text-xs text-yellow-500" title="取得失敗">⚠</span>
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

function FeedIcon({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);

  if (!url || failed) {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold"
        style={{ background: "var(--card-border)", color: "var(--muted)" }}
      >
        {title.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className="h-4 w-4 shrink-0 rounded-sm"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
