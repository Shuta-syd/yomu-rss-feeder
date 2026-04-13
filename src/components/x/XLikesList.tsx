"use client";

import React from "react";
import type { XLike } from "@/lib/db/schema";

interface Props {
  likes: XLike[];
  loading: boolean;
}

function formatDate(epochMs: number | null): string {
  if (!epochMs) return "";
  return new Date(epochMs).toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderTextWithLinks(text: string, urls: string | null): React.ReactNode {
  if (!urls) return <span>{text}</span>;

  let parsedUrls: string[];
  try {
    parsedUrls = JSON.parse(urls);
  } catch {
    return <span>{text}</span>;
  }

  // t.co リンクを展開URLに置換
  const parts: (string | React.ReactNode)[] = [];
  let remaining = text;
  let keyIdx = 0;

  for (const url of parsedUrls) {
    // t.co URLパターンを探す
    const tcoMatch = remaining.match(/https:\/\/t\.co\/\w+/);
    if (tcoMatch && tcoMatch.index !== undefined) {
      if (tcoMatch.index > 0) {
        parts.push(remaining.slice(0, tcoMatch.index));
      }
      parts.push(
        <a
          key={keyIdx++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: "var(--accent)" }}
        >
          {url.length > 50 ? url.slice(0, 50) + "..." : url}
        </a>,
      );
      remaining = remaining.slice(tcoMatch.index + tcoMatch[0].length);
    }
  }
  if (remaining) parts.push(remaining);

  return <span>{parts}</span>;
}

export function XLikesList({ likes, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" style={{ color: "var(--muted)" }}>
        読み込み中...
      </div>
    );
  }

  if (likes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12" style={{ color: "var(--muted)" }}>
        いいねデータがありません
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {likes.map((like) => (
        <div
          key={like.id}
          className="rounded-lg p-3"
          style={{ background: "var(--card)", border: "1px solid var(--card-border)" }}
        >
          <div className="flex items-start gap-3">
            {like.authorProfileImageUrl && (
              <img
                src={like.authorProfileImageUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{like.authorName}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  @{like.authorUsername}
                </span>
                <span className="ml-auto shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                  {formatDate(like.tweetCreatedAt)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                {renderTextWithLinks(like.text, like.urls)}
              </p>
              <div className="mt-2 flex gap-4 text-xs" style={{ color: "var(--muted)" }}>
                {like.replyCount != null && <span>返信 {like.replyCount}</span>}
                {like.retweetCount != null && <span>RT {like.retweetCount}</span>}
                {like.likeCount != null && <span>いいね {like.likeCount}</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
