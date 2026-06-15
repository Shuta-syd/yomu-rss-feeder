import Parser from "rss-parser";
import { v7 as uuidv7 } from "uuid";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, feeds } from "../db/schema";
import { sanitizeHtml, htmlToPlain } from "../sanitize";
import { computeDedupHash } from "./dedup";
import { fetchFullContent } from "./fullcontent";
import { fetchSafeHttpUrl } from "../url-safety";
import { readPositiveIntEnv } from "../env";
import { readResponseArrayBufferLimited } from "../http/read-limited";

const parser = new Parser({
  timeout: 30_000,
  headers: {
    "User-Agent": "yomu-rss-reader/1.0 (+https://github.com/yomu)",
  },
});
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_FEED_ITEMS = readPositiveIntEnv("YOMU_MAX_FEED_ITEMS", 200);
const MAX_FULL_CONTENT_FETCHES_PER_FEED = readPositiveIntEnv(
  "YOMU_MAX_FULL_CONTENT_FETCHES_PER_FEED",
  20,
);
const MAX_ITEM_HTML_CHARS = readPositiveIntEnv("YOMU_MAX_ITEM_HTML_CHARS", 200_000);

async function parseFeedUrl(url: string) {
  const { response } = await fetchSafeHttpUrl(url, {
    headers: {
      "User-Agent": "yomu-rss-reader/1.0 (+https://github.com/yomu)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Feed fetch failed: ${response.status}`);
  }
  const body = await readResponseArrayBufferLimited(response, MAX_FEED_BYTES);
  return parser.parseString(new TextDecoder("utf-8", { fatal: false }).decode(body));
}

export interface FetchResult {
  feedId: string;
  ok: boolean;
  error?: string;
  newArticles: number;
  newArticleIds: string[];
  processedItems: number;
  skippedExisting: number;
  limited: boolean;
}

export interface ParseValidation {
  title: string;
  siteUrl: string | null;
  description: string | null;
}

export interface FetchFeedOptions {
  maxItems?: number;
  maxFullContentFetches?: number;
}

export async function validateFeedUrl(url: string): Promise<ParseValidation> {
  const parsed = await parseFeedUrl(url);
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
  return fetchFeedWithOptions(feedId, url);
}

export async function fetchFeedWithOptions(
  feedId: string,
  url: string,
  options: FetchFeedOptions = {},
): Promise<FetchResult> {
  const now = Date.now();
  const feedRow = db.select({ aiEnabled: feeds.aiEnabled }).from(feeds).where(eq(feeds.id, feedId)).get();
  const aiEnabled = feedRow?.aiEnabled ?? true;
  const maxItems = options.maxItems ?? MAX_FEED_ITEMS;
  const maxFullContentFetches =
    options.maxFullContentFetches ?? MAX_FULL_CONTENT_FETCHES_PER_FEED;

  let parsed;
  try {
    parsed = await parseFeedUrl(url);
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
    return {
      feedId,
      ok: false,
      error: message,
      newArticles: 0,
      newArticleIds: [],
      processedItems: 0,
      skippedExisting: 0,
      limited: false,
    };
  }

  const sourceItems = parsed.items ?? [];
  const items = sourceItems.slice(0, maxItems);
  const limited = items.length < sourceItems.length;
  if (limited) {
    console.warn(
      `[yomu] feed item limit applied feedId=${feedId} items=${sourceItems.length} max=${maxItems}`,
    );
  }

  const newIds: string[] = [];
  let skippedExisting = 0;
  let fullContentFetches = 0;

  for (const item of items) {
    const dedupHash = computeDedupHash(feedId, {
      guid: item.guid,
      link: item.link,
      title: item.title,
      pubDate: item.pubDate,
    });

    const existing = db
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.feedId, feedId), eq(articles.dedupHash, dedupHash)))
      .get();
    if (existing) {
      skippedExisting++;
      continue;
    }

    const rawHtml =
      (item as { "content:encoded"?: string })["content:encoded"] ??
      item.content ??
      "";
    const boundedRawHtml = rawHtml.slice(0, MAX_ITEM_HTML_CHARS);
    let contentHtml = boundedRawHtml ? sanitizeHtml(boundedRawHtml) : null;
    let contentPlain = contentHtml ? htmlToPlain(contentHtml) : null;
    let thumbnailUrl = extractThumbnail(item, boundedRawHtml) ?? null;

    // RSS本文が短い場合、元記事からフルコンテンツ取得を試行
    const isShortContent = !contentPlain || contentPlain.length < 500;
    if (isShortContent && item.link && fullContentFetches < maxFullContentFetches) {
      fullContentFetches++;
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
        aiStage1Status: aiEnabled ? "pending" : "skipped",
      })
      .onConflictDoNothing({ target: [articles.feedId, articles.dedupHash] })
      .run();

    if (result.changes > 0 && aiEnabled) newIds.push(id);
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
    processedItems: items.length,
    skippedExisting,
    limited,
  };
}

export function shouldFetch(feed: {
  lastFetchedAt: number | null;
  fetchIntervalMin: number;
}, now: number = Date.now()): boolean {
  if (feed.lastFetchedAt == null) return true;
  return now - feed.lastFetchedAt >= feed.fetchIntervalMin * 60 * 1000;
}
