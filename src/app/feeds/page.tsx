"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FeedSidebar } from "@/components/feeds/FeedSidebar";
import { AddFeedDialog } from "@/components/feeds/AddFeedDialog";
import { ArticleList } from "@/components/articles/ArticleList";
import { ArticleDetail } from "@/components/articles/ArticleDetail";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { XLikesList } from "@/components/x/XLikesList";
import { XAnalysisPanel } from "@/components/x/XAnalysisPanel";
import type { FeedWithUnread } from "@/types/feed";
import type { ArticleDTO } from "@/types/article";
import type { XLike } from "@/lib/db/schema";

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
  const [aiStatus, setAiStatus] = useState<{ pending: number; processing: number; failed: number; currentTitle: string | null; currentFeedTitle: string | null } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"sidebar" | "list" | "detail">("list");
  const [view, setView] = useState<"feeds" | "likes">("feeds");
  const [likes, setLikes] = useState<XLike[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const [likesFetching, setLikesFetching] = useState(false);
  const [likesFetchResult, setLikesFetchResult] = useState<string | null>(null);
  const [xConnected, setXConnected] = useState<boolean | null>(null);
  const [slideDirection, setSlideDirection] = useState<"forward" | "back">("forward");

  const viewOrder = { sidebar: 0, list: 1, detail: 2 } as const;
  function goToMobileView(next: "sidebar" | "list" | "detail") {
    setSlideDirection(viewOrder[next] > viewOrder[mobileView] ? "forward" : "back");
    setMobileView(next);
  }
  const resizing = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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

  const loadLikes = useCallback(async () => {
    setLikesLoading(true);
    const res = await fetch("/api/x/likes?limit=100");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setLikes(data.likes);
    }
    setLikesLoading(false);
  }, [router]);

  useEffect(() => {
    if (view !== "likes") return;
    if (xConnected === null) {
      fetch("/api/x/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setXConnected(d ? !!d.connected : false));
    }
    loadLikes();
  }, [view, xConnected, loadLikes]);

  async function fetchLikes() {
    setLikesFetching(true);
    setLikesFetchResult(null);
    try {
      const res = await fetch("/api/x/likes", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLikesFetchResult(`${data.fetched}件取得`);
        loadLikes();
      } else {
        const data = await res.json();
        setLikesFetchResult(`エラー: ${data.error}`);
      }
    } catch {
      setLikesFetchResult("取得失敗");
    } finally {
      setLikesFetching(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/ai/status");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setAiStatus({ pending: data.pending, processing: data.processing, failed: data.failed, currentTitle: data.currentTitle, currentFeedTitle: data.currentFeedTitle });
      } catch {}
    }
    poll();
    const active = (aiStatus?.pending ?? 0) + (aiStatus?.processing ?? 0) > 0;
    const interval = setInterval(() => {
      poll();
      if (active) loadArticles();
    }, active ? 5000 : 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [aiStatus?.pending, aiStatus?.processing, loadArticles]);

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
    if (isMobile) goToMobileView("detail");
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

  const showSidebar = !isMobile || mobileView === "sidebar";
  const showList = !isMobile || mobileView === "list";
  const showDetail = !isMobile || mobileView === "detail";
  const slideClass = isMobile ? (slideDirection === "forward" ? "mobile-panel-forward" : "mobile-panel-back") : "";

  return (
    <div className="flex h-screen">
      <div
        key={isMobile ? `sb-${mobileView}` : "sb"}
        className={`${showSidebar ? (isMobile ? `w-full ${slideClass}` : "") : "hidden"}`}
      >
        <FeedSidebar
          feeds={feeds}
          selectedFeedId={selectedFeedId}
          onSelect={(id) => {
            setView("feeds");
            setSelectedFeedId(id);
            setSelected(null);
            if (isMobile) goToMobileView("list");
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
          isMobile={isMobile}
          view={view}
          onSelectLikes={() => {
            setView("likes");
            setSelected(null);
            if (isMobile) goToMobileView("list");
          }}
        />
      </div>
      <section
        key={isMobile ? `list-${mobileView}` : "list"}
        className={`${showList ? "flex" : "hidden"} ${isMobile ? `w-full ${slideClass}` : `shrink-0 ${listWidth === null ? "w-96" : ""}`} flex-col`}
        style={!isMobile && listWidth !== null ? { width: listWidth } : undefined}
      >
        <div
          className="flex items-center gap-2 border-b p-2"
          style={{ borderColor: "var(--card-border)" }}
        >
          {isMobile && (
            <button
              onClick={() => goToMobileView("sidebar")}
              className="rounded px-2 py-1 text-lg"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
              aria-label="フィード一覧"
            >
              ☰
            </button>
          )}
          {view === "feeds" ? (
            <input
              type="search"
              placeholder="検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 rounded px-2 py-1 text-sm"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
            />
          ) : (
            <>
              <span className="flex-1 text-sm font-semibold">X いいね</span>
              {likesFetchResult && (
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {likesFetchResult}
                </span>
              )}
              <button
                onClick={fetchLikes}
                disabled={likesFetching || xConnected === false}
                className="rounded px-2 py-1 text-xs disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {likesFetching ? "取得中..." : "いいね取得"}
              </button>
            </>
          )}
          <ThemeToggle />
          <a
            href="/settings"
            className="rounded px-2 py-1 text-xs"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          >
            ⚙
          </a>
        </div>
        {aiStatus && aiStatus.processing > 0 && aiStatus.currentFeedTitle && (
          <div
            className="flex items-center gap-2 border-b px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--card-border)", background: "var(--ai-bg)", color: "var(--muted)" }}
          >
            <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
            <span className="shrink-0" style={{ color: "var(--accent)" }}>翻訳中</span>
            <span className="min-w-0 flex-1 truncate font-medium" title={`${aiStatus.currentFeedTitle} / ${aiStatus.currentTitle ?? ""}`}>
              {aiStatus.currentFeedTitle}
              {aiStatus.currentTitle && <span className="ml-1 opacity-60">― {aiStatus.currentTitle}</span>}
            </span>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {view === "feeds" ? (
            <ArticleList
              articles={articles}
              selectedId={selected?.id ?? null}
              onSelect={handleSelect}
            />
          ) : xConnected === false ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              <p className="mb-3">X未連携です</p>
              <a
                href="/settings"
                className="rounded px-3 py-1.5 text-xs"
                style={{ background: "var(--accent)", color: "white" }}
              >
                設定画面へ
              </a>
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <XLikesList likes={likes} loading={likesLoading} />
            </div>
          )}
        </div>
      </section>
      {/* リサイズハンドル (desktop only) */}
      {!isMobile && (
        <div
          className="w-1 shrink-0 cursor-col-resize transition-colors hover:bg-[var(--accent)]"
          style={{ background: "var(--card-border)" }}
          onMouseDown={() => {
            resizing.current = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
        />
      )}
      <section
        key={isMobile ? `detail-${mobileView}` : "detail"}
        className={`${showDetail ? "flex" : "hidden"} ${isMobile ? `w-full ${slideClass}` : "flex-1"} flex-col overflow-hidden`}
      >
        {isMobile && (
          <div
            className="flex items-center gap-2 border-b p-2"
            style={{ borderColor: "var(--card-border)" }}
          >
            <button
              onClick={() => goToMobileView("list")}
              className="rounded px-2 py-1 text-sm"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
              aria-label="戻る"
            >
              ← 戻る
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {view === "feeds" ? (
            <ArticleDetail
              article={selected}
              onChange={(a) => {
                setSelected(a);
                setArticles((prev) => prev.map((x) => (x.id === a.id ? a : x)));
              }}
            />
          ) : (
            <div className="flex h-full flex-col">
              <div
                className="border-b p-3"
                style={{ borderColor: "var(--card-border)" }}
              >
                <h2 className="text-sm font-semibold">AI分析</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <XAnalysisPanel />
              </div>
            </div>
          )}
        </div>
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
