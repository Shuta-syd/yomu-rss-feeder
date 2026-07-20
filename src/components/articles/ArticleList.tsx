"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { ArticleDTO } from "@/types/article";
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
  selectedId: string | null;
  onSelect: (a: ArticleDTO) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  /** フィード/フィルタ等のクエリ識別子。変化したときだけスクロールを先頭に戻す */
  resetKey?: string;
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

export const ArticleList = memo(function ArticleList({ articles, selectedId, onSelect, onLoadMore, hasMore, loadingMore, resetKey }: Props) {
  const sentinelRef = useRef<HTMLLIElement>(null);
  const scrollRef = useRef<HTMLUListElement>(null);
  const firstId = articles[0]?.id ?? null;
  const [now, setNow] = useState(() => Date.now());

  // クエリ切替時のみ先頭へ戻す。バックグラウンド更新による新着の差し込みでは
  // スクロール位置を維持する
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [resetKey]);

  useEffect(() => {
    setNow(Date.now());
  }, [firstId]);

  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
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
  }, [hasMore, onLoadMore]);

  if (articles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--muted)" }}>
        記事がありません
      </div>
    );
  }

  let prevKey: string | null = null;
  return (
    <ul ref={scrollRef} className="article-list-container h-full overflow-y-auto">
      {articles.flatMap((a) => {
        const curKey = dateKey(a.sortKey);
        const showHeader = curKey !== prevKey;
        prevKey = curKey;
        const row = (
          <li key={a.id}>
            <button
              onClick={() => onSelect(a)}
              className="flex w-full flex-col gap-1 border-b px-4 py-3 text-left transition-colors hover:bg-[var(--accent-subtle)]"
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
                      className={`line-clamp-2 text-sm leading-snug ${a.isRead ? "" : "font-semibold"}`}
                    >
                      {a.aiTitleJa ?? a.title}
                    </span>
                  </div>
                  {a.aiSummaryShort && (
                    <p
                      className="mt-1 line-clamp-2 text-xs leading-relaxed"
                      style={{ color: "var(--muted)" }}
                    >
                      {a.aiSummaryShort}
                    </p>
                  )}
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs" style={{ color: "var(--muted)" }}>
                    <span>{formatDate(a.publishedAt)}</span>
                    {a.feedTitle && (
                      <span className="truncate text-right" title={a.feedTitle}>
                        {a.feedTitle}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
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
          {loadingMore ? "読み込み中..." : ""}
        </li>
      )}
    </ul>
  );
});
