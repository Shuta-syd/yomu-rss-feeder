import Parser from "rss-parser";
import { v7 as uuidv7 } from "uuid";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, feeds } from "../db/schema";
import { sanitizeHtml, htmlToPlain } from "../sanitize";
import { computeDedupHash } from "./dedup";
import { fetchFullContent } from "./fullcontent";

const parser = new Parser({
  timeout: 30_000,
  headers: {
    "User-Agent": "yomu-rss-reader/1.0 (+https://github.com/yomu)",
  },
});

export interface FetchResult {
  feedId: string;
  ok: boolean;
  error?: string;
  newArticles: number;
  newArticleIds: string[];
}

export interface ParseValidation {
  title: string;
  siteUrl: string | null;
  description: string | null;
}

export async function validateFeedUrl(url: string): Promise<ParseValidation> {
  const parsed = await parser.parseURL(url);
  return {
    title: parsed.title?.trim() || url,
    siteUrl: parsed.link?.trim() || null,
    description: parsed.description?.trim() || null,
  };
}

function resolveFaviconUrl(siteUrl: string | undefined | null): string | null {
  if (!siteUrl) return null;
  try {
    const hostname = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return null;
  }
}

function detectLanguage(text: string): string | null {
  if (!text) return null;
  // 簡易判定: 日本語文字が一定割合含まれていれば ja
  const jaChars = text.match(/[\u3040-\u30ff\u4e00-\u9faf]/g);
  if (jaChars && jaChars.length / text.length > 0.05) return "ja";
  if (/[A-Za-z]/.test(text)) return "en";
  return null;
}

function extractThumbnail(item: Parser.Item, contentHtml: string | null): string | null {
  // 1. enclosure (podcast/media)
  const enclosure = (item as Record<string, unknown>).enclosure as
    | { url?: string; type?: string }
    | undefined;
  if (enclosure?.url && enclosure.type?.startsWith("image/")) {
    return enclosure.url;
  }

  // 2. media:thumbnail or media:content
  const mediaThumbnail = (item as Record<string, unknown>)["media:thumbnail"] as
    | { $?: { url?: string } }
    | undefined;
  if (mediaThumbnail?.$?.url) return mediaThumbnail.$.url;

  const mediaContent = (item as Record<string, unknown>)["media:content"] as
    | { $?: { url?: string; medium?: string } }
    | undefined;
  if (mediaContent?.$?.url && mediaContent.$.medium === "image") {
    return mediaContent.$.url;
  }

  // 3. First <img> in content HTML
  if (contentHtml) {
    const match = contentHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match?.[1]) return match[1];
  }

  return null;
}

function parsePublished(input: string | undefined): number | null {
  if (!input) return null;
  const ms = Date.parse(input);
  return Number.isFinite(ms) ? ms : null;
}

export async function fetchFeed(feedId: string, url: string): Promise<FetchResult> {
  const now = Date.now();
  let parsed;
  try {
    parsed = await parser.parseURL(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    db.update(feeds)
      .set({
        lastFetchedAt: now,
        lastFetchStatus: "error",
        lastFetchError: message.slice(0, 500),
        consecutiveFetchFailures: sql`${feeds.consecutiveFetchFailures} + 1`,
      })
      .where(eq(feeds.id, feedId))
      .run();
    return { feedId, ok: false, error: message, newArticles: 0, newArticleIds: [] };
  }

  const newIds: string[] = [];
  for (const item of parsed.items ?? []) {
    const dedupHash = computeDedupHash(feedId, {
      guid: item.guid,
      link: item.link,
      title: item.title,
      pubDate: item.pubDate,
    });

    const rawHtml =
      (item as { "content:encoded"?: string })["content:encoded"] ??
      item.content ??
      "";
    let contentHtml = rawHtml ? sanitizeHtml(rawHtml) : null;
    let contentPlain = contentHtml ? htmlToPlain(contentHtml) : null;
    let thumbnailUrl = extractThumbnail(item, rawHtml) ?? null;

    // RSS本文が短い場合、元記事からフルコンテンツ取得を試行
    const isShortContent = !contentPlain || contentPlain.length < 500;
    if (isShortContent && item.link) {
      const full = await fetchFullContent(item.link);
      if (full) {
        contentHtml = full.contentHtml;
        contentPlain = full.contentPlain;
        if (!thumbnailUrl && full.thumbnailUrl) {
          thumbnailUrl = full.thumbnailUrl;
        }
      }
    }

    const publishedAt = parsePublished(item.isoDate ?? item.pubDate);
    const sortKey = publishedAt ?? now;

    const id = uuidv7();
    const result = db
      .insert(articles)
      .values({
        id,
        feedId,
        title: (item.title ?? "(no title)").slice(0, 500),
        url: item.link ?? "",
        author: item.creator ?? null,
        contentHtml,
        contentPlain,
        thumbnailUrl,
        publishedAt,
        sortKey,
        detectedLanguage: detectLanguage(
          `${item.title ?? ""} ${contentPlain?.slice(0, 200) ?? ""}`,
        ),
        dedupHash,
      })
      .onConflictDoNothing({ target: [articles.feedId, articles.dedupHash] })
      .run();

    if (result.changes > 0) newIds.push(id);
  }

  const siteUrl = parsed.link?.trim() || null;
  db.update(feeds)
    .set({
      lastFetchedAt: now,
      lastFetchStatus: "ok",
      lastFetchError: null,
      consecutiveFetchFailures: 0,
      title: parsed.title?.trim() || undefined,
      siteUrl,
      description: parsed.description?.trim() || null,
      faviconUrl: resolveFaviconUrl(siteUrl),
    })
    .where(eq(feeds.id, feedId))
    .run();

  return {
    feedId,
    ok: true,
    newArticles: newIds.length,
    newArticleIds: newIds,
  };
}

export function shouldFetch(feed: {
  lastFetchedAt: number | null;
  fetchIntervalMin: number;
}, now: number = Date.now()): boolean {
  if (feed.lastFetchedAt == null) return true;
  return now - feed.lastFetchedAt >= feed.fetchIntervalMin * 60 * 1000;
}

// 未使用import警告回避
void and;
