"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FeedSidebar } from "@/components/feeds/FeedSidebar";
import { AddFeedDialog } from "@/components/feeds/AddFeedDialog";
import { ReadFilterToggle } from "@/components/feeds/ReadFilterToggle";
import { ArticleList } from "@/components/articles/ArticleList";
import { ArticleDetail } from "@/components/articles/ArticleDetail";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { buildArticlesParams, type ReadFilter } from "@/lib/articles-params";
import { parseFeedsUrl, buildFeedsUrl } from "@/lib/feeds-url-state";
import { mergeArticles, appendArticles } from "@/lib/merge-articles";
import { subscribeUpdates } from "@/lib/article-note-saver";
import type { FeedWithUnread } from "@/types/feed";
import type { SavedSiteDTO } from "@/types/site";
import type { ArticleDTO } from "@/types/article";

export default function FeedsPage() {
  const router = useRouter();
  const [feeds, setFeeds] = useState<FeedWithUnread[]>([]);
  const [sites, setSites] = useState<SavedSiteDTO[]>([]);
  const [articles, setArticles] = useState<ArticleDTO[]>([]);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<ArticleDTO | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const abortRef = useRef<AbortController | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [listWidth, setListWidth] = useState<number | null>(null);
  const [aiStatus, setAiStatus] = useState<{ pending: number; processing: number; failed: number; currentTitle: string | null; currentFeedTitle: string | null } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"sidebar" | "list" | "detail">("list");
  const [view, setView] = useState<"feeds" | "starred">("feeds");
  const [markingRead, setMarkingRead] = useState(false);
  const [autoMarkAsRead, setAutoMarkAsRead] = useState(true);
  const [slideDirection, setSlideDirection] = useState<"forward" | "back">("forward");
  // URL からの初期状態復元が済むまで loadInitial を待たせ、既定→復元の二重 fetch を防ぐ
  const [restored, setRestored] = useState(false);

  const mobileViewRef = useRef(mobileView);
  useEffect(() => {
    mobileViewRef.current = mobileView;
  }, [mobileView]);

  const goToMobileView = useCallback((next: "sidebar" | "list" | "detail") => {
    const viewOrder = { sidebar: 0, list: 1, detail: 2 } as const;
    setSlideDirection(viewOrder[next] > viewOrder[mobileViewRef.current] ? "forward" : "back");
    setMobileView(next);
  }, []);
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

  const loadSites = useCallback(async () => {
    const res = await fetch("/api/sites");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setSites(data.sites);
  }, [router]);

  const loadInitial = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const params = buildArticlesParams({
      feedId: selectedFeedId,
      category: selectedCategory,
      search,
      view,
      readFilter,
    });
    try {
      const res = await fetch(`/api/articles?${params}`, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (ctrl.signal.aborted) return;
      setArticles(data.articles);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e;
    }
  }, [selectedFeedId, selectedCategory, search, view, readFilter, router]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const ctrl = abortRef.current;
    if (!ctrl) return;
    setLoadingMore(true);
    const params = buildArticlesParams({
      feedId: selectedFeedId,
      category: selectedCategory,
      search,
      view,
      readFilter,
      cursor: nextCursor,
    });
    try {
      const res = await fetch(`/api/articles?${params}`, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (ctrl.signal.aborted) return;
        setArticles((prev) => appendArticles(prev, data.articles));
        setNextCursor(data.nextCursor ?? null);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") throw e;
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, selectedFeedId, selectedCategory, search, view, readFilter, router]);

  // バックグラウンド更新: リストを丸ごと差し替えず ID マージで更新する。
  // 行コンポーネントの再マウント (サムネイル再読み込み)・ページネーション破壊・
  // スクロール位置の喪失を防ぐ。
  const articlesQueryKey = buildArticlesParams({
    feedId: selectedFeedId,
    category: selectedCategory,
    search,
    view,
    readFilter,
  }).toString();
  const queryKeyRef = useRef(articlesQueryKey);
  const articlesEmptyRef = useRef(true);
  const refreshingRef = useRef(false);

  useEffect(() => {
    queryKeyRef.current = articlesQueryKey;
  });
  useEffect(() => {
    articlesEmptyRef.current = articles.length === 0;
  }, [articles]);

  const refreshArticles = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const params = buildArticlesParams({
        feedId: selectedFeedId,
        category: selectedCategory,
        search,
        view,
        readFilter,
      });
      const startKey = params.toString();
      const res = await fetch(`/api/articles?${params}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      // 取得中にフィルタ/フィードが切り替わっていたら破棄
      if (queryKeyRef.current !== startKey) return;
      const wasEmpty = articlesEmptyRef.current;
      setArticles((prev) => mergeArticles(prev, data.articles));
      if (wasEmpty) setNextCursor(data.nextCursor ?? null);
    } catch {
      // バックグラウンド更新の失敗は次回ポーリングに任せる
    } finally {
      refreshingRef.current = false;
    }
  }, [selectedFeedId, selectedCategory, search, view, readFilter, router]);

  useEffect(() => {
    loadFeeds();
    loadSites();
  }, [loadFeeds, loadSites]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (r.status === 401) {
          router.replace("/login");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (d && typeof d.autoMarkAsRead === "boolean") {
          setAutoMarkAsRead(d.autoMarkAsRead);
        }
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    if (selectedCategory === null) return;
    const exists = feeds.some((f) => f.category === selectedCategory);
    if (!exists) setSelectedCategory(null);
  }, [feeds, selectedCategory]);

  useEffect(() => {
    return subscribeUpdates((updated) => {
      setSelected((cur) => (cur?.id === updated.id ? updated : cur));
      setArticles((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    });
  }, []);

  useEffect(() => {
    if (!restored) return;
    loadInitial();
  }, [loadInitial, restored]);

  // マウント時に一度だけ URL を読み、閲覧状態を復元する。
  // ハイドレーション不整合を避けるため useState 初期値ではなく effect で行う。
  useEffect(() => {
    const s = parseFeedsUrl(window.location.search);
    if (s.feedId) setSelectedFeedId(s.feedId);
    if (s.category) setSelectedCategory(s.category);
    if (s.view === "starred") setView("starred");
    if (s.readFilter !== "all") setReadFilter(s.readFilter);
    if (s.search) setSearch(s.search);
    if (s.articleId) {
      fetch(`/api/articles/${s.articleId}`)
        .then((r) => {
          if (r.status === 401) {
            router.replace("/login");
            return null;
          }
          return r.ok ? r.json() : null;
        })
        .then((a) => {
          if (!a) return;
          setSelected(a);
          if (window.matchMedia("(max-width: 767px)").matches) {
            setMobileView("detail");
          }
        })
        .catch(() => {});
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 閲覧状態を URL に書き戻す。history.replaceState なので履歴は増やさず、
  // Next のナビゲーション/再 fetch も起こさない。
  useEffect(() => {
    if (!restored) return;
    const url =
      window.location.pathname +
      buildFeedsUrl({
        articleId: selected?.id ?? null,
        feedId: selectedFeedId,
        category: selectedCategory,
        view,
        readFilter,
        search,
      });
    window.history.replaceState(null, "", url);
  }, [restored, selected?.id, selectedFeedId, selectedCategory, view, readFilter, search]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/ai/status");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const next = {
          pending: data.pending,
          processing: data.processing,
          failed: data.failed,
          currentTitle: data.currentTitle,
          currentFeedTitle: data.currentFeedTitle,
        };
        setAiStatus((prev) => (
          prev &&
          prev.pending === next.pending &&
          prev.processing === next.processing &&
          prev.failed === next.failed &&
          prev.currentTitle === next.currentTitle &&
          prev.currentFeedTitle === next.currentFeedTitle
            ? prev
            : next
        ));
      } catch {}
    }
    poll();
    const active = (aiStatus?.pending ?? 0) + (aiStatus?.processing ?? 0) > 0;
    const interval = setInterval(() => {
      poll();
      if (active) refreshArticles();
    }, active ? 5000 : 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [aiStatus?.pending, aiStatus?.processing, refreshArticles]);

  async function markAllRead() {
    setMarkingRead(true);
    const body: Record<string, string> = {};
    if (selectedFeedId) body.feedId = selectedFeedId;
    else if (selectedCategory) body.category = selectedCategory;
    const res = await fetch("/api/articles/mark-all-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setMarkingRead(false);
    if (res.ok) {
      loadInitial();
      loadFeeds();
    }
  }

  async function sync() {
    setSyncing(true);
    const res = await fetch("/api/sync", { method: "POST" });
    setSyncing(false);
    if (res.ok) {
      loadFeeds();
      refreshArticles();
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const handleSelect = useCallback((a: ArticleDTO) => {
    setSelected(a);
    if (isMobile) goToMobileView("detail");
    if (autoMarkAsRead && !a.isRead) {
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
  }, [autoMarkAsRead, goToMobileView, isMobile, loadFeeds]);

  const handleArticleChange = useCallback((a: ArticleDTO) => {
    setSelected((cur) => (cur?.id === a.id ? a : cur));
    setArticles((prev) => prev.map((x) => (x.id === a.id ? a : x)));
  }, []);

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
          sites={sites}
          selectedFeedId={selectedFeedId}
          selectedCategory={selectedCategory}
          onSelect={(id) => {
            setView("feeds");
            setSelectedFeedId(id);
            setSelectedCategory(null);
            setSelected(null);
            if (isMobile) goToMobileView("list");
          }}
          onSelectCategory={(category) => {
            setView("feeds");
            setSelectedFeedId(null);
            setSelectedCategory(category);
            setSelected(null);
            if (isMobile) goToMobileView("list");
          }}
          onAddFeed={() => setAddOpen(true)}
          onSitesChanged={loadSites}
          onSync={sync}
          syncing={syncing}
          onLogout={logout}
          onFeedMoved={loadFeeds}
          onFeedsDeleted={() => {
            loadFeeds();
            loadInitial();
            setSelected(null);
            setSelectedFeedId(null);
            setSelectedCategory(null);
          }}
          onCategoryRenamed={(oldName, newName) => {
            setSelectedCategory((cur) => (cur === oldName ? newName : cur));
          }}
          isMobile={isMobile}
          view={view}
          onSelectStarred={() => {
            setView("starred");
            setSelectedFeedId(null);
            setSelectedCategory(null);
            setSelected(null);
            if (isMobile) goToMobileView("list");
          }}
        />
      </div>
      <section
        key="list"
        className={`${showList ? "flex" : "hidden"} ${isMobile ? `w-full ${mobileView === "list" ? slideClass : ""}` : `shrink-0 ${listWidth === null ? "w-96" : ""}`} flex-col`}
        style={!isMobile && listWidth !== null ? { width: listWidth } : undefined}
      >
        <div
          className="flex items-center gap-2 border-b p-2"
          style={{ borderColor: "var(--card-border)" }}
        >
          {isMobile && (
            <button
              onClick={() => goToMobileView("sidebar")}
              className="shrink-0 rounded px-2 py-1 text-sm"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
              aria-label="フィード一覧"
            >
              ☰
            </button>
          )}
          <input
            type="search"
            placeholder="検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 rounded px-2 py-1 text-sm"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          />
          <ReadFilterToggle value={readFilter} onChange={setReadFilter} />
          <button
            onClick={markAllRead}
            disabled={markingRead || articles.every((a) => a.isRead)}
            className="shrink-0 rounded px-2 py-1 text-sm disabled:opacity-40"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
            title="表示中をすべて既読"
            aria-label="表示中をすべて既読"
          >
            {markingRead ? "…" : "✓"}
          </button>
          <ThemeToggle />
          <a
            href="/settings"
            className="shrink-0 rounded px-2 py-1 text-sm"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
            aria-label="設定"
          >
            ⚙
          </a>
        </div>
        {/* バッチ処理中はバナーを出し続け、ポーリングごとの出没でレイアウトが上下しないようにする */}
        {aiStatus && (aiStatus.processing > 0 || aiStatus.pending > 0) && (
          <div
            className="flex items-center gap-2 border-b px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--card-border)", background: "var(--ai-bg)", color: "var(--muted)" }}
          >
            <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: "var(--accent)" }} />
            {aiStatus.processing > 0 && aiStatus.currentFeedTitle ? (
              <>
                <span className="shrink-0" style={{ color: "var(--accent)" }}>翻訳中</span>
                <span className="min-w-0 flex-1 truncate font-medium" title={`${aiStatus.currentFeedTitle} / ${aiStatus.currentTitle ?? ""}`}>
                  {aiStatus.currentFeedTitle}
                  {aiStatus.currentTitle && <span className="ml-1 opacity-60">― {aiStatus.currentTitle}</span>}
                </span>
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--accent)" }}>
                AI処理待ち {aiStatus.pending}件
              </span>
            )}
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <ArticleList
            articles={articles}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            onLoadMore={loadMore}
            hasMore={nextCursor !== null}
            loadingMore={loadingMore}
            resetKey={articlesQueryKey}
          />
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
          <ArticleDetail
            key={selected?.id ?? "empty"}
            article={selected}
            onChange={handleArticleChange}
          />
        </div>
      </section>

      <AddFeedDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          loadFeeds();
          loadInitial();
        }}
      />
    </div>
  );
}
