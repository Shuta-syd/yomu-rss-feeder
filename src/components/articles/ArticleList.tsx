"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { ArticleDTO } from "@/types/article";
import { ReadLaterButton } from "./ReadLaterButton";
import type { ArticleGroup } from "@/lib/article-groups";
import { previewTags, previewText } from "@/lib/article-preview";
import { dateKey, formatDateHeader } from "@/lib/article-date";

const Thumbnail = memo(function Thumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      className="article-list-thumbnail h-20 w-24 shrink-0 rounded object-cover"
      style={{ background: "var(--card)" }}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
});

interface Props {
  articles: ArticleDTO[];
  relevanceOrder?: boolean;
  groups: ArticleGroup<ArticleDTO>[];
  grouping: boolean;
  onGroupingChange: (value: boolean) => void;
  loadMoreError?: string | null;
  selectedId: string | null;
  onChange: (a: ArticleDTO) => void;
  onSelect: (a: ArticleDTO) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  /** フィード/フィルタ等のクエリ識別子。変化したときだけスクロールを先頭に戻す */
  resetKey?: string;
  /** Only show cross-feed grouping in all-feeds and category views. */
  allowGrouping?: boolean;
  emptyMessage?: string;
}

function formatDate(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}


function RelatedArticles({ articles, selectedId, onSelect }: { articles: ArticleDTO[]; selectedId: string | null; onSelect: (a: ArticleDTO) => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const containsSelected = articles.some(a => a.id === selectedId);
  useEffect(() => { if (containsSelected && detailsRef.current) detailsRef.current.open = true; }, [containsSelected]);
  return <details ref={detailsRef} className="reader-related">
    <summary>関連記事 {articles.length}件<span>配信元を比較</span></summary>
    <div className="reader-related-list">{articles.map(article => <button key={article.id} type="button" onClick={() => onSelect(article)} aria-current={selectedId === article.id ? "true" : undefined}>
      <span className="reader-related-source">{!article.isRead && <span className="reader-related-unread" aria-label="未読"/>}{article.feedTitle || "配信元不明"}<time>{formatDate(article.publishedAt)}</time></span>
      <span className="reader-related-title">{previewText(article.aiTitleJa) || article.title}</span>
      <span className="reader-related-domain">{(() => { try { return new URL(article.url).hostname; } catch { return ""; } })()}</span>
    </button>)}</div>
  </details>;
}

export const ArticleList = memo(function ArticleList({ articles, relevanceOrder = false, groups, grouping, onGroupingChange, loadMoreError, selectedId, onChange, onSelect, onLoadMore, hasMore, loadingMore, resetKey, allowGrouping = false, emptyMessage = "記事がありません" }: Props) {
  const groupedCount = articles.length - groups.length;
  const sentinelRef = useRef<HTMLLIElement>(null);
  const scrollRef = useRef<HTMLUListElement>(null);
  const firstId = articles[0]?.id ?? null;
  const [now, setNow] = useState(() => Date.now());

  // クエリ切替時のみ先頭へ戻す。バックグラウンド更新による新着の差し込みでは
  // スクロール位置を維持する
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [resetKey, grouping]);

  // Keep desktop selection visible without scrolling the reader or the page.
  useEffect(() => {
    if (!selectedId || !window.matchMedia("(min-width: 768px)").matches) return;
    const frame = window.requestAnimationFrame(() => {
      const list = scrollRef.current;
      const item = list?.querySelector<HTMLElement>('[aria-current="true"]');
      if (!list || !item) return;
      const viewport = list.getBoundingClientRect();
      const bounds = item.getBoundingClientRect();
      const top = viewport.top + list.clientTop;
      const bottom = top + list.clientHeight;
      let delta = 0;
      if (bounds.height > list.clientHeight) delta = bounds.top - top;
      else if (bounds.top < top) delta = bounds.top - top;
      else if (bounds.bottom > bottom) delta = bounds.bottom - bottom;
      if (delta) list.scrollTo({
        top: list.scrollTop + delta,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId]);

  useEffect(() => {
    setNow(Date.now());
  }, [firstId]);

  useEffect(() => {
    if (!hasMore || !onLoadMore || loadingMore || loadMoreError) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onLoadMore, loadingMore, loadMoreError]);

  if (articles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--muted)" }}>
        {emptyMessage}
      </div>
    );
  }

  let prevKey: string | null = null;
  return (
    <div className="reader-grouped-list">
    {allowGrouping && <div className="reader-grouping-control"><label><input type="checkbox" checked={grouping} onChange={e => onGroupingChange(e.target.checked)}/><span>重複記事をまとめる</span></label><span className="reader-grouping-count" role="status">{grouping && groupedCount > 0 ? `${groupedCount}件を集約` : ""}</span><p>読み込み済みの記事から、同じURL・ほぼ同じ見出しをまとめます</p></div>}
    <ul ref={scrollRef} className="article-list-container min-h-0 flex-1 overflow-y-auto">
      {groups.flatMap(({representative: a, related}) => {
        const curKey = dateKey(a.sortKey);
        const showHeader = !relevanceOrder && curKey !== prevKey;
        prevKey = curKey;
        const tags = previewTags(a.aiTags);
        const title = previewText(a.aiTitleJa) || a.title;
        const summary = previewText(a.aiSummaryShort);
        const row = (
          <li key={a.id} className="border-b" style={{
            borderColor: "var(--card-border)",
            background: selectedId === a.id ? "var(--accent-subtle)" : "transparent",
          }}>
            <button
              onClick={() => onSelect(a)}
              aria-current={selectedId === a.id ? "true" : undefined}
              className="reader-article-preview flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-[var(--accent-subtle)]"
              style={{
                borderColor: "var(--card-border)",
                background: selectedId === a.id ? "var(--accent-subtle)" : "transparent",
              }}
            >
              <div className="flex gap-3">
                {a.thumbnailUrl && <Thumbnail src={a.thumbnailUrl} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    {!a.isRead && (
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: "var(--unread-dot)" }}
                      />
                    )}
                    {a.isStarred && <span className="text-yellow-500">★</span>}
                    {a.note && <span title="メモあり" aria-label="メモあり">📝</span>}
                    {a.aiStage1Status === "processing" && (
                      <span
                        className="mt-0.5 inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-t-transparent"
                        style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
                        title="AI処理中"
                      />
                    )}
                    <span
                      title={title}
                      className={`reader-preview-title line-clamp-3 text-sm leading-snug ${a.isRead ? "" : "font-semibold"}`}
                    >
                      {title}
                    </span>
                  </div>
                </div>
              </div>
              {tags.length > 0 && <div className="reader-preview-tags" aria-label="記事の分類">{tags.slice(0, 3).map(tag => <span key={tag} className="reader-preview-tag" data-kind={tag.split(":")[0]} title={tag}><span className="sr-only">{tag.split(":")[0]}：</span>{tag.split(":")[1]}</span>)}{tags.length > 3 && <span className="reader-preview-more" title={tags.slice(3).join("、")} aria-label={`その他の分類：${tags.slice(3).join("、")}`}>+{tags.length - 3}</span>}</div>}
              {summary && <p className="reader-preview-summary line-clamp-2">{summary}</p>}
              <div className="reader-preview-meta"><span className="truncate" title={a.feedTitle ?? undefined}>{a.feedTitle}</span><span>{formatDate(a.publishedAt)}</span></div>

            </button>
            <div className="flex justify-end px-1 pb-1"><ReadLaterButton article={a} onChange={onChange}/></div>
            {related.length > 0 && <RelatedArticles articles={related} selectedId={selectedId} onSelect={onSelect}/> }
          </li>
        );
        if (!showHeader) return [row];
        // 日付ヘッダは日付文字列を key にして独立させる。新着でグループ先頭の
        // 記事が入れ替わっても、既存行の DOM (サムネイル) を再構築させない
        return [
          <li
            key={`hdr-${curKey}`}
            className="sticky top-0 z-10 border-b px-4 py-1.5 text-xs font-semibold"
            style={{
              background: "var(--sidebar-bg)",
              color: "var(--muted)",
              borderColor: "var(--card-border)",
            }}
          >
            {formatDateHeader(a.sortKey, now)}
          </li>,
          row,
        ];
      })}
      {hasMore && (
        <li
          ref={sentinelRef}
          className="flex h-12 items-center justify-center text-xs"
          style={{ color: "var(--muted)" }}
        >
          {loadingMore ? "読み込み中..." : loadMoreError ? <><p role="alert">{loadMoreError}</p><button type="button" className="min-h-11 underline" onClick={onLoadMore}>再試行</button></> : ""}
        </li>
      )}
    </ul>
    </div>
  );
});
