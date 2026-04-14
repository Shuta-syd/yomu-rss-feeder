"use client";

import React from "react";
import type { XLike } from "@/lib/db/schema";

interface Props {
  likes: XLike[];
  loading: boolean;
}

type UrlEntity = {
  url: string;
  expanded: string;
  display: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
};

type MediaItem = {
  type: string;
  url: string | null;
  width?: number | null;
  height?: number | null;
};

function parseUrls(raw: string | null): UrlEntity[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // backward compat: old format was string[] of expanded urls
    if (typeof parsed[0] === "string") {
      return (parsed as string[]).map((u) => ({
        url: u,
        expanded: u,
        display: u.replace(/^https?:\/\//, ""),
      }));
    }
    return parsed as UrlEntity[];
  } catch {
    return [];
  }
}

function parseMedia(raw: string | null): MediaItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MediaItem[]) : [];
  } catch {
    return [];
  }
}

function relativeTime(epochMs: number | null): string {
  if (!epochMs) return "";
  const diff = Date.now() - epochMs;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}日`;
  return new Date(epochMs).toLocaleDateString("ja-JP", {
    year: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function formatCount(n: number | null | undefined): string {
  if (n == null) return "";
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1) + "K";
  if (n < 1_000_000) return Math.floor(n / 1000) + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

function renderText(text: string, urls: UrlEntity[], mediaCount: number): React.ReactNode {
  // media がある場合は末尾の t.co を除去 (メディア用の短縮URL)
  let working = text;
  if (mediaCount > 0) {
    working = working.replace(/\s*https:\/\/t\.co\/\w+\s*$/, "");
  }

  const parts: React.ReactNode[] = [];
  const urlMap = new Map(urls.map((u) => [u.url, u]));
  const regex = /https:\/\/t\.co\/\w+/g;
  let lastIdx = 0;
  let keyIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(working)) !== null) {
    if (match.index > lastIdx) {
      parts.push(working.slice(lastIdx, match.index));
    }
    const entity = urlMap.get(match[0]);
    if (entity) {
      parts.push(
        <a
          key={keyIdx++}
          href={entity.expanded}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {entity.display}
        </a>,
      );
    } else {
      parts.push(match[0]);
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < working.length) parts.push(working.slice(lastIdx));
  return parts;
}

function MediaGrid({ items }: { items: MediaItem[] }) {
  const photos = items.filter((m) => m.url);
  if (photos.length === 0) return null;
  const n = Math.min(photos.length, 4);
  const gridCls =
    n === 1
      ? "grid-cols-1"
      : n === 2
        ? "grid-cols-2"
        : "grid-cols-2";
  return (
    <div
      className={`mt-2 grid gap-0.5 overflow-hidden rounded-2xl ${gridCls}`}
      style={{ border: "1px solid var(--card-border)" }}
    >
      {photos.slice(0, 4).map((m, i) => (
        <a
          key={i}
          href={m.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`relative block ${
            n === 3 && i === 0 ? "row-span-2" : ""
          }`}
          style={{
            aspectRatio: n === 1 ? "16 / 9" : "1 / 1",
            background: "var(--card)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={m.url ?? ""}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </a>
      ))}
    </div>
  );
}

function LinkCard({ entity }: { entity: UrlEntity }) {
  if (!entity.title && !entity.image) return null;
  return (
    <a
      href={entity.expanded}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-2 block overflow-hidden rounded-2xl transition-colors hover:bg-[var(--accent-subtle)]"
      style={{ border: "1px solid var(--card-border)" }}
    >
      {entity.image && (
        <div className="w-full" style={{ aspectRatio: "16 / 9", background: "var(--card)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entity.image}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <div className="p-3">
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          {new URL(entity.expanded).hostname.replace(/^www\./, "")}
        </div>
        {entity.title && (
          <div className="mt-0.5 line-clamp-2 text-sm font-medium">{entity.title}</div>
        )}
        {entity.description && (
          <div className="mt-0.5 line-clamp-2 text-xs" style={{ color: "var(--muted)" }}>
            {entity.description}
          </div>
        )}
      </div>
    </a>
  );
}

function IconReply() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z" />
    </svg>
  );
}
function IconRetweet() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
    </svg>
  );
}
function IconLike() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z" />
    </svg>
  );
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
    <div>
      {likes.map((like) => {
        const urls = parseUrls(like.urls);
        const mediaItems = parseMedia(like.mediaUrls);
        const linkCard = urls.find((u) => u.title || u.image);
        const tweetUrl = `https://x.com/${like.authorUsername}/status/${like.id}`;

        return (
          <a
            key={like.id}
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block cursor-pointer px-4 py-3 transition-colors hover:bg-[var(--accent-subtle)]"
            style={{ borderBottom: "1px solid var(--card-border)" }}
          >
            <div className="flex gap-3">
              {like.authorProfileImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={like.authorProfileImageUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              ) : (
                <div
                  className="h-10 w-10 shrink-0 rounded-full"
                  style={{ background: "var(--card)" }}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1 text-sm">
                  <span className="truncate font-bold">{like.authorName}</span>
                  <span className="truncate" style={{ color: "var(--muted)" }}>
                    @{like.authorUsername}
                  </span>
                  <span style={{ color: "var(--muted)" }}>·</span>
                  <span className="shrink-0" style={{ color: "var(--muted)" }}>
                    {relativeTime(like.tweetCreatedAt)}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-snug">
                  {renderText(like.text, urls, mediaItems.length)}
                </p>
                {mediaItems.length > 0 && <MediaGrid items={mediaItems} />}
                {mediaItems.length === 0 && linkCard && <LinkCard entity={linkCard} />}
                <div
                  className="mt-2 flex max-w-md justify-between text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  <span className="flex items-center gap-1">
                    <IconReply />
                    {formatCount(like.replyCount)}
                  </span>
                  <span className="flex items-center gap-1">
                    <IconRetweet />
                    {formatCount(like.retweetCount)}
                  </span>
                  <span className="flex items-center gap-1" style={{ color: "#f91880" }}>
                    <IconLike />
                    {formatCount(like.likeCount)}
                  </span>
                </div>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
