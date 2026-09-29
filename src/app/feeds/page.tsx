"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {SearchLoading} from "@/components/feeds/SearchLoading";
import type {JevSearchProgress} from "@/lib/jev-search";
import {UpdateStatusPanel} from "@/components/feeds/UpdateStatusPanel";
import type {AIUpdateStatus} from "@/lib/update-status";
import { FeedSidebar } from "@/components/feeds/FeedSidebar";
import { AddFeedDialog } from "@/components/feeds/AddFeedDialog";
import { ReadFilterToggle } from "@/components/feeds/ReadFilterToggle";
import { ClassificationFilters } from "@/components/articles/ClassificationFilters";
import { ArticleList } from "@/components/articles/ArticleList";
import { groupArticles } from "@/lib/article-groups";
import { articleNeighbors } from "@/lib/article-navigation";
import { articleShortcut } from "@/lib/article-shortcuts";
import { ArticleDetail } from "@/components/articles/ArticleDetail";
import { ReaderIcon } from "@/components/ui/ReaderIcon";
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
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const [grouping, setGrouping] = useState(true);
  useEffect(() => { try { setGrouping(localStorage.getItem("yomu-group-related") !== "false"); } catch { /* Storage may be unavailable. */ } }, []);
  const changeGrouping = useCallback((value: boolean) => {
    setGrouping(value);
    try { localStorage.setItem("yomu-group-related", String(value)); } catch { /* Keep the current session usable. */ }
  }, []);
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const abortRef = useRef<AbortController | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError,setSyncError]=useState<string|null>(null);
  const [classifications, setClassifications] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [keywordOverride, setKeywordOverride] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [jevEnabled, setJevEnabled] = useState(false);
  const [searchInfo, setSearchInfo] = useState<JevSearchProgress | null>(null);
  useEffect(() => { setSearchDraft(search); }, [search]);
  const [listWidth, setListWidth] = useState<number | null>(null);
  const [aiStatus, setAiStatus] = useState<AIUpdateStatus | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isCompactDesktop, setIsCompactDesktop] = useState(false);
  const [desktopSidebarExpanded, setDesktopSidebarExpanded] = useState(true);
  const [compactDrawerOpen, setCompactDrawerOpen] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [mobileView, setMobileView] = useState<"sidebar" | "list" | "detail">("list");
  const [readLaterCount, setReadLaterCount] = useState(0);
  const loadReadLaterCount = useCallback(async () => {
    try { const response = await fetch("/api/articles?isReadLater=true&limit=1"); if (response.ok) setReadLaterCount((await response.json()).total); } catch { /* Keep the last count while offline. */ }
  }, []);
  useEffect(() => { loadReadLaterCount(); const timer=setInterval(loadReadLaterCount,30000);return () => clearInterval(timer); }, [loadReadLaterCount]);
  const [view, setView] = useState<"feeds" | "starred" | "later">("feeds");
  const readLaterListVersion = view === "later" ? readLaterCount : 0;
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
  const addFeedTriggerRef = useRef<HTMLElement | null>(null);

  const openAddFeedDialog = useCallback(() => {
    addFeedTriggerRef.current = document.activeElement as HTMLElement | null;
    setAddOpen(true);
  }, []);

  const closeAddFeedDialog = useCallback(() => {
    setAddOpen(false);
    window.requestAnimationFrame(() => addFeedTriggerRef.current?.focus());
  }, []);

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
    setSearchLoading(true);setSearchError(null);setSearchInfo(null);setLoadMoreError(null);
    setArticles([]);setNextCursor(null);
    const params = buildArticlesParams({
      feedId: selectedFeedId,
      category: selectedCategory,
      search,
      searchMode: keywordOverride ? "keyword" : undefined,
      classifications,
      view,
      readFilter,
    });
    try {
      while (!ctrl.signal.aborted) {
        const res = await fetch(`/api/articles?${params}`, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        if (res.status === 401) { router.replace("/login"); return; }
        const data = await res.json();
        if (ctrl.signal.aborted) return;
        if (!res.ok) { setSearchError(data.error ?? "記事を取得できませんでした。"); return; }
        setSearchInfo(data.search ?? null);
        if (res.status === 202 && data.pending && data.search?.jobId) {
          params.set("searchJob", data.search.jobId);
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
            const timer = setTimeout(() => { ctrl.signal.removeEventListener("abort", abort); resolve(); }, 500);
            ctrl.signal.addEventListener("abort", abort, {once:true});
          });
          continue;
        }
        setArticles(data.articles);
        setNextCursor(data.nextCursor ?? null);
        return;
      }
    } catch (e) {
      if (!ctrl.signal.aborted && (e as Error).name !== "AbortError") setSearchError("通信できませんでした。再試行してください。");
    } finally {
      if (!ctrl.signal.aborted) setSearchLoading(false);
    }
  }, [selectedFeedId, selectedCategory, search, keywordOverride, classifications, view, readFilter, router]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    const ctrl = abortRef.current;
    if (!ctrl) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    const params = buildArticlesParams({
      feedId: selectedFeedId,
      category: selectedCategory,
      search,
      searchMode: keywordOverride ? "keyword" : undefined,
      classifications,
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
      } else {
        const data = await res.json().catch(() => ({}));
        setLoadMoreError(data.error ?? "続きを取得できませんでした。再試行してください。");
      }
    } catch (e) {
      if (!ctrl.signal.aborted && (e as Error).name !== "AbortError") setLoadMoreError("通信できませんでした。接続を確認して再試行してください。");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor, selectedFeedId, selectedCategory, search, keywordOverride, classifications, view, readFilter, router]);

  // バックグラウンド更新: リストを丸ごと差し替えず ID マージで更新する。
  // 行コンポーネントの再マウント (サムネイル再読み込み)・ページネーション破壊・
  // スクロール位置の喪失を防ぐ。
  const articlesQueryKey = buildArticlesParams({
    feedId: selectedFeedId,
    category: selectedCategory,
    search,
    searchMode: keywordOverride ? "keyword" : undefined,
    classifications,
    view,
    readFilter,
  }).toString();
  useEffect(() => { setLoadMoreError(null); }, [articlesQueryKey]);
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
    if (search.trim() || refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const params = buildArticlesParams({
        feedId: selectedFeedId,
        category: selectedCategory,
        search,
        classifications,
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
  }, [selectedFeedId, selectedCategory, search, classifications, view, readFilter, router]);

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
        if (d) setJevEnabled(d.jevSearchEnabled === true);
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
    void loadInitial();
    return () => abortRef.current?.abort();
  }, [loadInitial, restored, readLaterListVersion]);

  // マウント時に一度だけ URL を読み、閲覧状態を復元する。
  // ハイドレーション不整合を避けるため useState 初期値ではなく effect で行う。
  useEffect(() => {
    const s = parseFeedsUrl(window.location.search);
    if (s.feedId) setSelectedFeedId(s.feedId);
    if (s.category) setSelectedCategory(s.category);
    setView(s.view);
    if (s.readFilter !== "all") setReadFilter(s.readFilter);
    if (s.search) setSearch(s.search);
    setClassifications(s.classifications ?? []);
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
        classifications,
      });
    window.history.replaceState(null, "", url);
  }, [restored, selected?.id, selectedFeedId, selectedCategory, view, readFilter, search, classifications]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/ai/status");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const next = {
          pauseReason: data.pauseReason ?? null,
          pending: data.pending,
          processing: data.processing,
          failed: data.failed,
          failureCounts: data.failureCounts,
          lastFailureAt: data.lastFailureAt,
          currentTitle: data.currentTitle,
          currentFeedTitle: data.currentFeedTitle,
        };
        setAiStatus((prev) => (
          prev &&
          prev.pauseReason === next.pauseReason &&
          prev.pending === next.pending &&
          prev.processing === next.processing &&
          prev.failed === next.failed &&
          JSON.stringify(prev.failureCounts) === JSON.stringify(next.failureCounts) &&
          prev.lastFailureAt === next.lastFailureAt &&
          prev.currentTitle === next.currentTitle &&
          prev.currentFeedTitle === next.currentFeedTitle
            ? prev
            : next
        ));
      } catch {}
    }
    poll();
    const active = !aiStatus?.pauseReason && (aiStatus?.pending ?? 0) + (aiStatus?.processing ?? 0) > 0;
    const interval = setInterval(() => {
      poll();
      if (active) refreshArticles();
    }, active ? 5000 : 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [aiStatus?.pending, aiStatus?.processing, aiStatus?.pauseReason, refreshArticles]);

  async function markAllRead() {
    if (view === "later") return;
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
    setSyncing(true);setSyncError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.ok) {void loadFeeds();void refreshArticles();}
      else setSyncError(res.status===409?"ほかの更新が進行中です。しばらく待って再試行してください。":"更新できませんでした。再試行してください。");
    } catch {setSyncError("通信できませんでした。接続状態を確認してください。");} finally {setSyncing(false);}
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
          setSelected(current => current?.id === updated.id ? updated : current);
          setArticles((prev) =>
            prev.map((x) => (x.id === updated.id ? updated : x)),
          );
          loadFeeds();
        }
      }).catch(() => { /* Keep reading if marking as read fails. */ });
    }
  }, [autoMarkAsRead, goToMobileView, isMobile, loadFeeds]);

  const handleArticleChange = useCallback((a: ArticleDTO) => {
    setSelected((cur) => (cur?.id === a.id ? a : cur));
    setArticles((prev) => prev.map((x) => (x.id === a.id ? a : x)).filter(x => {
      if (view === "later" && !x.isReadLater) return false;
      if (classifications.length === 0) return true;
      try { const tags: unknown = JSON.parse(x.aiTags ?? "[]"); return Array.isArray(tags) && classifications.every(tag => tags.includes(tag)); }
      catch { return false; }
    }));
    loadReadLaterCount();
  }, [view, classifications, loadReadLaterCount]);

  const allowGrouping = view === "feeds" && selectedFeedId === null;
  const articleGroups = useMemo(() => allowGrouping && grouping
    ? groupArticles(articles)
    : articles.map(representative => ({ representative, related: [] as ArticleDTO[] })), [articles, allowGrouping, grouping]);
  const neighbors = articleNeighbors(articleGroups, selected);

  useEffect(() => {
    if (isMobile || !selected || compactDrawerOpen) return;
    function onArticleKeyDown(event: KeyboardEvent) {
      if (document.querySelector('[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]')) return;
      const direction = articleShortcut(event);
      if (!direction) return;
      const article = direction === "previous" ? neighbors.previous : neighbors.next;
      if (!article) return;
      event.preventDefault();
      handleSelect(article);
    }
    window.addEventListener("keydown", onArticleKeyDown);
    return () => window.removeEventListener("keydown", onArticleKeyDown);
  }, [isMobile, selected, compactDrawerOpen, neighbors.previous, neighbors.next, handleSelect]);

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
          onAddFeed={openAddFeedDialog}
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
          readLaterCount={readLaterCount}
          onSelectLater={() => {
            setView("later"); setSelectedFeedId(null); setSelectedCategory(null); setSelected(null);
            setReadFilter("all");setSearch("");setClassifications([]);
            finishSidebarNavigation();
          }}
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
          className="reader-toolbar"
          style={{ borderColor: "var(--card-border)" }}
        >
          <div className="reader-search-row">
          {isMobile && (
            <button
              ref={sidebarOpenButtonRef}
              type="button"
              onClick={openMobileSidebar}
              className="reader-icon-button"
              aria-label="フィード一覧を開く"
              aria-controls="feed-sidebar-panel"
              aria-expanded="false"
            >
              <ReaderIcon name="menu"/>
            </button>
          )}
          {!isMobile && !desktopSidebarOpen && (
            <button
              ref={sidebarOpenButtonRef}
              type="button"
              onClick={openDesktopSidebar}
              className="reader-icon-button"
              aria-label="フィード一覧を開く"
              aria-controls="feed-sidebar-panel"
              aria-expanded="false"
              title="フィード一覧を開く"
            >
              <ReaderIcon name="menu"/>
            </button>
          )}
          <form className="reader-search-field" onSubmit={e => {
            e.preventDefault();
            if (searchDraft.trim() === search.trim()) void loadInitial();
            else { setSearch(searchDraft.trim()); setSelected(null); }
          }}>
          <ReaderIcon name="search"/>
          <input
            type="search"
            placeholder={jevEnabled && !keywordOverride ? "例：面接について" : "記事を検索"}
            aria-label="記事を検索"
            value={searchDraft}
            maxLength={300}
            onChange={(e) => { setSearchDraft(e.target.value); if (!e.target.value) { setSearch(""); setKeywordOverride(false); } }}
            className="reader-search-input"
          />
          <button type="submit" disabled={searchLoading} className="reader-icon-button disabled:opacity-50" aria-label="検索を実行" title="検索を実行"><ReaderIcon name="search"/></button>
          </form>
          </div>
          <div className="reader-toolbar-actions">
            <ReadFilterToggle value={readFilter} onChange={setReadFilter} />
            <button
              onClick={markAllRead}
              disabled={view === "later" || classifications.length > 0 || markingRead || articles.every((a) => a.isRead)}
              className="reader-icon-button"
              title={view === "later" ? "あとで読むでは一括既読を利用できません" : classifications.length > 0 ? "分類で絞り込み中は一括既読を利用できません" : "表示中をすべて既読"}
              aria-label="表示中をすべて既読"
            >
              {markingRead ? "…" : <ReaderIcon name="check"/>}
            </button>
            <ThemeToggle compact />
            <a
              href="/settings"
              className="reader-icon-button"
              aria-label="設定"
            >
              <ReaderIcon name="settings"/>
            </a>
          </div>
        </div>
        {(searchLoading || searchError || search.trim()) && <div className="border-b px-4 py-2 text-sm" style={{borderColor:"var(--card-border)"}}>
          {search.trim() && <p className="text-xs" style={{color:"var(--muted)"}}>検索範囲：{selectedFeedId ? feeds.find(f=>f.id===selectedFeedId)?.title ?? "選択したフィード" : selectedCategory ?? "全フィード"} · 現在の絞り込み条件を適用</p>}
          {searchLoading && <SearchLoading progress={searchInfo} semantic={Boolean(search.trim() && jevEnabled && !keywordOverride)} onCancel={()=>{abortRef.current?.abort();setSearchLoading(false);setSearchError("検索を中断しました。30分以内なら完了した判定から再開できます。");}}/>}
          {searchError ? <p role="alert">{searchError}</p> : null}
          {!searchLoading && searchInfo?.stage === "done" && <p role="status">Jev検索 · 関連度順 · タイトル{searchInfo.titleChecked.toLocaleString()}件／候補{searchInfo.bodyChecked.toLocaleString()}件を確認</p>}
          {search.trim() && jevEnabled && !keywordOverride && <p className="mt-1 text-xs" style={{color:"var(--muted)"}}>全タイトルから候補を選び、要約・本文抜粋で確認します。全フィードの検索には時間と利用料がかかります。フィード・カテゴリで範囲を絞れます。</p>}
          {search.trim() && jevEnabled && !keywordOverride && <button type="button" className="underline py-2" onClick={()=>setKeywordOverride(true)}>この検索を通常検索に切り替える</button>}
          {search.trim() && jevEnabled && keywordOverride && <button type="button" className="underline py-2" onClick={()=>setKeywordOverride(false)}>Jev検索に戻す</button>}
          {(searchError || loadMoreError) && <button type="button" className="underline py-2 ml-3" onClick={()=>void loadInitial()}>再試行</button>}
        </div>}
        {view === "later" && <div className="flex items-center gap-2 border-b px-4 py-3 text-sm" style={{borderColor:"var(--card-border)",color:"var(--accent)"}}><ReaderIcon name="bookmark"/><h2 className="font-semibold">あとで読む</h2><span className="ml-auto text-xs">{readLaterCount}件保存</span></div>}
        <ClassificationFilters
          conditions={{feedId:selectedFeedId,category:selectedCategory,view,readFilter,search,classifications}}
          onClassifications={values=>{setClassifications(values);setSelected(null);}}
          onApply={value=>{
            setClassifications(value.classifications);setSelectedFeedId(value.feedId);setSelectedCategory(value.category);
            setView(value.view);setReadFilter(value.readFilter);setSearch(value.search);setSelected(null);
          }}
        />
        <UpdateStatusPanel syncError={syncError} ai={aiStatus} syncing={syncing} onUpdated={()=>{void loadFeeds();void refreshArticles();}}/>
        <div className="flex-1 overflow-hidden">
          {searchLoading ? <SearchLoading skeleton /> : <ArticleList
            articles={articles}
            relevanceOrder={searchInfo?.mode === "jev"}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            onChange={handleArticleChange}
            onLoadMore={loadMore}
            hasMore={nextCursor !== null}
            loadingMore={loadingMore}
            resetKey={articlesQueryKey}
            allowGrouping={allowGrouping}
            groups={articleGroups}
            grouping={grouping}
            onGroupingChange={changeGrouping}
            loadMoreError={loadMoreError}
            emptyMessage={searchLoading ? "検索中…" : searchError ? "検索結果を取得できませんでした" : searchInfo?.mode === "jev" ? "候補の中に、検索意図に十分合う記事が見つかりませんでした" : view === "later" ? "条件に合う保存記事がありません。一覧の「あとで読む」から追加できます。" : undefined}
          />}
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
            previousArticle={neighbors.previous}
            nextArticle={neighbors.next}
            onNavigate={handleSelect}
            hasMore={nextCursor !== null}
            loadingMore={loadingMore}
            loadMoreError={loadMoreError}
            onLoadMore={loadMore}
          />
        </div>
      </section>

      {addOpen && (
        <AddFeedDialog
          categories={feeds.map((feed) => feed.category)}
          initialCategory={selectedCategory}
          onClose={closeAddFeedDialog}
          onAdded={() => {
            loadFeeds();
            loadInitial();
          }}
        />
      )}
    </div>
  );
}
