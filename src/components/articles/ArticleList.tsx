"use client";

import { useState } from "react";
import type { ArticleDTO } from "@/types/article";

function Thumbnail({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      className="h-16 w-16 shrink-0 rounded object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

interface Props {
  articles: ArticleDTO[];
  selectedId: string | null;
  onSelect: (a: ArticleDTO) => void;
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

export function ArticleList({ articles, selectedId, onSelect }: Props) {
  if (articles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--muted)" }}>
        記事がありません
      </div>
    );
  }
  return (
    <ul className="h-full overflow-y-auto">
      {articles.map((a) => (
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
                <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>
                  {formatDate(a.publishedAt)}
                </span>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
