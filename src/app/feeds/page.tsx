"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FeedSidebar } from "@/components/feeds/FeedSidebar";
import { AddFeedDialog } from "@/components/feeds/AddFeedDialog";
import { ArticleList } from "@/components/articles/ArticleList";
import { ArticleDetail } from "@/components/articles/ArticleDetail";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { FeedWithUnread } from "@/types/feed";
import type { ArticleDTO } from "@/types/article";

export default function FeedsPage() {
  const router = useRouter();
  const [feeds, setFeeds] = useState<FeedWithUnread[]>([]);
  const [articles, setArticles] = useState<ArticleDTO[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ArticleDTO | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [listWidth, setListWidth] = useState<number | null>(null);
  const resizing = useRef(false);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizing.current) return;
      const sidebar = document.querySelector("aside");
      const sidebarWidth = sidebar?.offsetWidth ?? 256;
      const newWidth = e.clientX - sidebarWidth;
      setListWidth(Math.max(240, Math.min(newWidth, 800)));
    }
    function onMouseUp() {
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const loadFeeds = useCallback(async () => {
    const res = await fetch("/api/feeds");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data = await res.json();
    setFeeds(data.feeds);
  }, [router]);

  const loadArticles = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedFeedId) params.set("feedId", selectedFeedId);
    if (search) params.set("search", search);
    const res = await fetch(`/api/articles?${params}`);
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    const data = await res.json();
    setArticles(data.articles);
  }, [selectedFeedId, search, router]);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  async function sync() {
    setSyncing(true);
    const res = await fetch("/api/sync", { method: "POST" });
    setSyncing(false);
    if (res.ok) {
      loadFeeds();
      loadArticles();
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  function handleSelect(a: ArticleDTO) {
    setSelected(a);
    if (!a.isRead) {
      fetch(`/api/articles/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      }).then((r) => r.ok && r.json()).then((updated) => {
        if (updated) {
          setSelected(updated);
          setArticles((prev) =>
            prev.map((x) => (x.id === updated.id ? updated : x)),
          );
          loadFeeds();
        }
      });
    }
  }

  return (
    <div className="flex h-screen">
      <FeedSidebar
        feeds={feeds}
        selectedFeedId={selectedFeedId}
        onSelect={(id) => {
          setSelectedFeedId(id);
          setSelected(null);
        }}
        onAddFeed={() => setAddOpen(true)}
        onSync={sync}
        syncing={syncing}
        onLogout={logout}
        onFeedMoved={loadFeeds}
        onFeedsDeleted={() => {
          loadFeeds();
          loadArticles();
          setSelected(null);
          setSelectedFeedId(null);
        }}
      />
      <section
        className={`flex shrink-0 flex-col ${listWidth === null ? "w-96" : ""}`}
        style={listWidth !== null ? { width: listWidth } : undefined}
      >
        <div
          className="flex items-center gap-2 border-b p-2"
          style={{ borderColor: "var(--card-border)" }}
        >
          <input
            type="search"
            placeholder="検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded px-2 py-1 text-sm"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          />
          <ThemeToggle />
          <a
            href="/settings"
            className="rounded px-2 py-1 text-xs"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          >
            ⚙
          </a>
        </div>
        <div className="flex-1 overflow-hidden">
          <ArticleList
            articles={articles}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
          />
        </div>
      </section>
      {/* リサイズハンドル */}
      <div
        className="w-1 shrink-0 cursor-col-resize transition-colors hover:bg-[var(--accent)]"
        style={{ background: "var(--card-border)" }}
        onMouseDown={() => {
          resizing.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
      />
      <section className="flex-1 overflow-hidden">
        <ArticleDetail
          article={selected}
          onChange={(a) => {
            setSelected(a);
            setArticles((prev) => prev.map((x) => (x.id === a.id ? a : x)));
          }}
        />
      </section>

      <AddFeedDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          loadFeeds();
          loadArticles();
        }}
      />
    </div>
  );
}
