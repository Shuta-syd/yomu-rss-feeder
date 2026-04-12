"use client";

import type { FeedWithUnread } from "@/types/feed";
import { useState, useRef, useEffect } from "react";

interface Props {
  feeds: FeedWithUnread[];
  selectedFeedId: string | null;
  onSelect: (feedId: string | null) => void;
  onAddFeed: () => void;
  onSync: () => void;
  syncing: boolean;
  onLogout: () => void;
  onFeedMoved?: () => void;
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
}: Props) {
  const grouped = feeds.reduce<Record<string, FeedWithUnread[]>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});
  const categories = Object.keys(grouped).sort();
  const totalUnread = feeds.reduce((n, f) => n + (f.unreadCount ?? 0), 0);

  const [dragFeedId, setDragFeedId] = useState<string | null>(null);

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
      className="flex h-full w-64 shrink-0 flex-col border-r"
      style={{ background: "var(--sidebar-bg)", borderColor: "var(--card-border)" }}
    >
      <div className="flex items-center justify-between border-b p-3" style={{ borderColor: "var(--card-border)" }}>
        <h1 className="font-semibold">Yomu</h1>
        <div className="flex gap-1">
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
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 text-sm">
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
          />
        ))}
      </nav>

      <div className="border-t p-2" style={{ borderColor: "var(--card-border)" }}>
        <button
          onClick={onAddFeed}
          className="w-full rounded px-2 py-1 text-xs"
          style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
        >
          + フィード追加
        </button>
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
}: {
  category: string;
  feeds: FeedWithUnread[];
  selectedFeedId: string | null;
  onSelect: (id: string | null) => void;
  dragFeedId: string | null;
  onDragStart: (id: string | null) => void;
  onDrop: (feedId: string, category: string) => void;
  onRename: (oldName: string, newName: string) => void;
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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(true);
  }

  function handleDragLeave() {
    setDropTarget(false);
  }

  function handleDrop(e: React.DragEvent) {
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
      className="mt-3 rounded transition-colors"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        background: dropTarget ? "var(--accent-subtle)" : "transparent",
        outline: dropTarget ? "2px dashed var(--accent)" : "none",
        outlineOffset: "-2px",
      }}
    >
      {editing ? (
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
      {open && (
        <div className="mt-1">
          {feeds.map((f) => (
            <button
              key={f.id}
              draggable
              onDragStart={(e) => {
                onDragStart(f.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", f.id);
              }}
              onDragEnd={() => onDragStart(null)}
              onClick={() => onSelect(f.id)}
              className="flex w-full cursor-grab items-center gap-2 rounded px-2 py-1 text-left active:cursor-grabbing"
              style={{
                background: selectedFeedId === f.id ? "var(--accent-subtle)" : "transparent",
              }}
            >
              {f.faviconUrl && (
                <img
                  src={f.faviconUrl}
                  alt=""
                  className="h-4 w-4 shrink-0 rounded-sm"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <span className="min-w-0 flex-1 truncate">{f.title}</span>
              {f.consecutiveFetchFailures >= 3 && (
                <span className="shrink-0 text-xs text-yellow-500" title="取得失敗">⚠</span>
              )}
              {f.unreadCount > 0 && (
                <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                  {f.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
