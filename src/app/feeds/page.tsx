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

const COMPACT_DESKTOP_QUERY = "(min-width: 768px) and (max-width: 1199px)";
const DESKTOP_SIDEBAR_STORAGE_KEY = "yomu:desktop-sidebar-expanded";
const ARTICLE_LIST_DEFAULT_WIDTH = 384;
const ARTICLE_LIST_MIN_WIDTH = 320;
const ARTICLE_DETAIL_MIN_WIDTH = 420;
const RESIZE_HANDLE_WIDTH = 4;

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
  const [isCompactDesktop, setIsCompactDesktop] = useState(false);
  const [desktopSidebarExpanded, setDesktopSidebarExpanded] = useState(true);
  const [compactDrawerOpen, setCompactDrawerOpen] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [mobileView, setMobileView] = useState<"sidebar" | "list" | "detail">("list");
  const [view, setView] = useState<"feeds" | "starred">("feeds");
  const [markingRead, setMarkingRead] = useState(false);
  const [autoMarkAsRead, setAutoMarkAsRead] = useState(true);
  const [slideDirection, setSlideDirection] = useState<"forward" | "back">("forward");
  // URL からの初期状態復元が済むまで loadInitial を待たせ、既定→復元の二重 fetch を防ぐ
  const [restored, setRestored] = useState(false);
  const desktopSidebarOpen = isCompactDesktop
    ? compactDrawerOpen
    : desktopSidebarExpanded;

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
  const layoutRef = useRef<HTMLDivElement>(null);
  const listPanelRef = useRef<HTMLElement>(null);
  const sidebarPanelRef = useRef<HTMLDivElement>(null);
  const sidebarOpenButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mobileMq = window.matchMedia("(max-width: 767px)");
    const compactMq = window.matchMedia(COMPACT_DESKTOP_QUERY);
    let readyFrame = 0;
    const update = () => {
      setIsMobile(mobileMq.matches);
      setIsCompactDesktop(compactMq.matches);
      // 中間幅のドロワーは、ブレークポイントをまたぐたびに閉じた状態から始める。
      if (!compactMq.matches) setCompactDrawerOpen(false);
    };
    update();
    readyFrame = window.requestAnimationFrame(() => setLayoutReady(true));
    mobileMq.addEventListener("change", update);
    compactMq.addEventListener("change", update);
    return () => {
      window.cancelAnimationFrame(readyFrame);
      mobileMq.removeEventListener("change", update);
      compactMq.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY);
      if (stored === "false") setDesktopSidebarExpanded(false);
      if (stored === "true") setDesktopSidebarExpanded(true);
    } catch {
      // localStorage が使えない環境では、既定の開いた状態を使う。
    }
  }, []);

  const setDesktopSidebarPreference = useCallback((expanded: boolean) => {
    setDesktopSidebarExpanded(expanded);
    try {
      window.localStorage.setItem(DESKTOP_SIDEBAR_STORAGE_KEY, String(expanded));
    } catch {
      // 保存できなくても、このセッション中の開閉は継続する。
    }
  }, []);

  const focusSidebarCloseButton = useCallback(() => {
    window.requestAnimationFrame(() => {
      sidebarPanelRef.current
        ?.querySelector<HTMLButtonElement>("[data-sidebar-close]")
        ?.focus();
    });
  }, []);

  const openDesktopSidebar = useCallback(() => {
    if (isCompactDesktop) setCompactDrawerOpen(true);
    else setDesktopSidebarPreference(true);
    focusSidebarCloseButton();
  }, [focusSidebarCloseButton, isCompactDesktop, setDesktopSidebarPreference]);

  const closeDesktopSidebar = useCallback((restoreFocus = true) => {
    if (isCompactDesktop) setCompactDrawerOpen(false);
    else setDesktopSidebarPreference(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => sidebarOpenButtonRef.current?.focus());
    }
  }, [isCompactDesktop, setDesktopSidebarPreference]);

  const openMobileSidebar = useCallback(() => {
    goToMobileView("sidebar");
    focusSidebarCloseButton();
  }, [focusSidebarCloseButton, goToMobileView]);

  const closeMobileSidebar = useCallback(() => {
    goToMobileView("list");
    window.requestAnimationFrame(() => sidebarOpenButtonRef.current?.focus());
  }, [goToMobileView]);

  useEffect(() => {
    if (!isCompactDesktop || !compactDrawerOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDesktopSidebar();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDesktopSidebar, compactDrawerOpen, isCompactDesktop]);

  useEffect(() => {
    const sidebarUnavailable = isMobile
      ? mobileView !== "sidebar"
      : !desktopSidebarOpen;
    if (!sidebarUnavailable) return;
    if (!sidebarPanelRef.current?.contains(document.activeElement)) return;
    const frame = window.requestAnimationFrame(() => {
      sidebarOpenButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [desktopSidebarOpen, isMobile, mobileView]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizing.current) return;
      const listPanel = listPanelRef.current;
      const listLeft = listPanel?.getBoundingClientRect().left ?? 0;
      const layoutRight = layoutRef.current?.getBoundingClientRect().right ?? window.innerWidth;
      const availableWidth = Math.max(
        ARTICLE_LIST_MIN_WIDTH,
        layoutRight - listLeft - ARTICLE_DETAIL_MIN_WIDTH - RESIZE_HANDLE_WIDTH,
      );
      const cssMaxWidth = listPanel
        ? Number.parseFloat(window.getComputedStyle(listPanel).maxWidth)
        : availableWidth;
      const maxWidth = Number.isFinite(cssMaxWidth)
        ? Math.min(availableWidth, cssMaxWidth)
        : availableWidth;
      const newWidth = e.clientX - listLeft;
      setListWidth(Math.max(ARTICLE_LIST_MIN_WIDTH, Math.min(newWidth, maxWidth)));
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
  // 広幅時は閉じている間も同じ上限を使い、開閉アニメーション中に一覧幅が跳ねないようにする。
  const sidebarReservedWidth = isCompactDesktop ? 0 : 256;
  const desktopListMaxWidth = `calc(100vw - ${sidebarReservedWidth + ARTICLE_DETAIL_MIN_WIDTH + RESIZE_HANDLE_WIDTH}px)`;
  const compactDrawerModal = !isMobile && isCompactDesktop && compactDrawerOpen;
  const sidebarShellClass = isMobile
    ? showSidebar
      ? `w-full ${slideClass}`
      : "hidden"
    : isCompactDesktop
      ? `absolute inset-y-0 left-0 z-30 h-full w-64 shadow-2xl ${desktopSidebarOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-full opacity-0"}`
      : `h-full shrink-0 overflow-hidden ${desktopSidebarOpen ? "w-64 opacity-100" : "pointer-events-none w-0 opacity-0"}`;

  function finishSidebarNavigation() {
    if (isMobile) goToMobileView("list");
    else if (isCompactDesktop) closeDesktopSidebar();
  }

  return (
    <div
      ref={layoutRef}
      className={`relative flex h-screen min-w-0 overflow-hidden ${layoutReady ? "visible" : "invisible"}`}
    >
      {!isMobile && isCompactDesktop && (
        <div
          className={`feed-sidebar-backdrop absolute inset-0 z-20 bg-black/35 ${desktopSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"} ${layoutReady ? "sidebar-motion-ready" : ""}`}
          onClick={() => closeDesktopSidebar()}
          aria-hidden="true"
        />
      )}
      <div
        ref={sidebarPanelRef}
        id="feed-sidebar-panel"
        key={isMobile ? `sb-${mobileView}` : "sb"}
        className={`feed-sidebar-shell ${sidebarShellClass} ${layoutReady ? "sidebar-motion-ready" : ""}`}
        aria-hidden={!isMobile && !desktopSidebarOpen ? true : undefined}
        inert={!isMobile && !desktopSidebarOpen ? true : undefined}
        role={compactDrawerModal ? "dialog" : undefined}
        aria-modal={compactDrawerModal ? true : undefined}
        aria-label={compactDrawerModal ? "フィード一覧" : undefined}
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
            finishSidebarNavigation();
          }}
          onSelectCategory={(category) => {
            setView("feeds");
            setSelectedFeedId(null);
            setSelectedCategory(category);
            setSelected(null);
            finishSidebarNavigation();
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
          onCollapse={isMobile
            ? closeMobileSidebar
            : () => closeDesktopSidebar()}
          view={view}
          onSelectStarred={() => {
            setView("starred");
            setSelectedFeedId(null);
            setSelectedCategory(null);
            setSelected(null);
            finishSidebarNavigation();
          }}
        />
      </div>
      <section
        ref={listPanelRef}
        key="list"
        className={`article-list-panel ${showList ? "flex" : "hidden"} ${isMobile ? `w-full ${mobileView === "list" ? slideClass : ""}` : "min-w-0 shrink-0"} flex-col`}
        style={!isMobile ? {
          width: listWidth ?? ARTICLE_LIST_DEFAULT_WIDTH,
          minWidth: ARTICLE_LIST_MIN_WIDTH,
          maxWidth: desktopListMaxWidth,
        } : undefined}
        inert={compactDrawerModal ? true : undefined}
        aria-hidden={compactDrawerModal ? true : undefined}
      >
        <div
          className="article-list-toolbar flex items-center gap-2 border-b p-2"
          style={{ borderColor: "var(--card-border)" }}
        >
          {isMobile && (
            <button
              ref={sidebarOpenButtonRef}
              type="button"
              onClick={openMobileSidebar}
              className="shrink-0 rounded px-2 py-1 text-sm"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
              aria-label="フィード一覧を開く"
              aria-controls="feed-sidebar-panel"
              aria-expanded="false"
            >
              ☰
            </button>
          )}
          {!isMobile && !desktopSidebarOpen && (
            <button
              ref={sidebarOpenButtonRef}
              type="button"
              onClick={openDesktopSidebar}
              className="shrink-0 rounded px-2 py-1 text-sm"
              style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
              aria-label="フィード一覧を開く"
              aria-controls="feed-sidebar-panel"
              aria-expanded="false"
              title="フィード一覧を開く"
            >
              ☰
            </button>
          )}
          <input
            type="search"
            placeholder="検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="article-list-search min-w-0 flex-1 rounded px-2 py-1 text-sm"
            style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
          />
          <div className="article-list-toolbar-actions flex shrink-0 items-center gap-2">
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
        className={`${showDetail ? "flex" : "hidden"} ${isMobile ? `w-full ${slideClass}` : "min-w-0 flex-1"} flex-col overflow-hidden`}
        inert={compactDrawerModal ? true : undefined}
        aria-hidden={compactDrawerModal ? true : undefined}
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
