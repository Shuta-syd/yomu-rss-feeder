import { rawDb } from "./db";
import type { Article } from "./db/schema";

export type ArticleWithFeed = Article & { feedTitle: string | null };

export interface ArticleListParams {
  feedId?: string;
  category?: string;
  classification?: string;
  classifications?: string[];
  isRead?: boolean;
  isStarred?: boolean;
  isReadLater?: boolean;
  search?: string;
  /** Internal candidate retrieval; never accepted directly from HTTP. */
  searchTerms?: string[];
  rankedIds?: string[];
  cursor?: string;
  limit?: number;
}

export interface ArticleListResult {
  articles: ArticleWithFeed[];
  nextCursor: string | null;
  total: number;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function parseCursor(cursor: string | undefined): { sortKey: number; id: string } | null {
  if (!cursor) return null;
  const idx = cursor.indexOf("_");
  if (idx < 0) return null;
  const sortKey = Number.parseInt(cursor.slice(0, idx), 10);
  const id = cursor.slice(idx + 1);
  if (!Number.isFinite(sortKey) || !id) return null;
  return { sortKey, id };
}

function makeCursor(sortKey: number, id: string): string {
  return `${sortKey}_${id}`;
}

export function rowToArticle(row: Record<string, unknown>): ArticleWithFeed {
  return {
    id: row["id"] as string,
    feedId: row["feed_id"] as string,
    feedTitle: (row["feed_title"] as string | null) ?? null,
    title: row["title"] as string,
    url: row["url"] as string,
    author: (row["author"] as string | null) ?? null,
    contentHtml: (row["content_html"] as string | null) ?? null,
    contentPlain: (row["content_plain"] as string | null) ?? null,
    thumbnailUrl: (row["thumbnail_url"] as string | null) ?? null,
    publishedAt: (row["published_at"] as number | null) ?? null,
    sortKey: row["sort_key"] as number,
    detectedLanguage: (row["detected_language"] as string | null) ?? null,
    dedupHash: row["dedup_hash"] as string,
    isRead: Boolean(row["is_read"]),
    isReadLater: Boolean(row["is_read_later"]),
    isStarred: Boolean(row["is_starred"]),
    readAt: (row["read_at"] as number | null) ?? null,
    aiSummaryShort: (row["ai_summary_short"] as string | null) ?? null,
    aiTitleJa: (row["ai_title_ja"] as string | null) ?? null,
    aiTags: (row["ai_tags"] as string | null) ?? null,
    manualClassification: (row["manual_classification"] as string | null) ?? null,
    aiStage1Status: row["ai_stage1_status"] as string,
    aiStage1Error: (row["ai_stage1_error"] as string | null) ?? null,
    aiStage1ProcessedAt: (row["ai_stage1_processed_at"] as number | null) ?? null,
    aiSummaryFull: (row["ai_summary_full"] as string | null) ?? null,
    aiTranslation: (row["ai_translation"] as string | null) ?? null,
    aiKeyPoints: (row["ai_key_points"] as string | null) ?? null,
    aiRelatedLinks: (row["ai_related_links"] as string | null) ?? null,
    aiStage2Status: row["ai_stage2_status"] as string,
    aiStage2Error: (row["ai_stage2_error"] as string | null) ?? null,
    aiStage2ProcessedAt: (row["ai_stage2_processed_at"] as number | null) ?? null,
    note: (row["note"] as string | null) ?? null,
    createdAt: row["created_at"] as number,
    browserImportedAt: (row["browser_imported_at"] as number | null) ?? null,
  };
}

export function listArticles(params: ArticleListParams): ArticleListResult {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const where: string[] = [];
  const values: unknown[] = [];
  let orderSql = "a.sort_key DESC, a.id DESC";
  const orderValues: unknown[] = [];

  if (params.feedId) {
    where.push("a.feed_id = ?");
    values.push(params.feedId);
  } else if (params.category) {
    where.push("a.feed_id IN (SELECT id FROM feeds WHERE category = ?)");
    values.push(params.category);
  }
  for (const classification of new Set([...(params.classifications ?? []), ...(params.classification ? [params.classification] : [])])) {
    where.push("EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(a.ai_tags) THEN a.ai_tags ELSE '[]' END) WHERE value = ?)");
    values.push(classification);
  }
  if (params.isRead !== undefined) {
    where.push("a.is_read = ?");
    values.push(params.isRead ? 1 : 0);
  }
  if (params.isReadLater !== undefined) {
    where.push("a.is_read_later = ?");
    values.push(params.isReadLater ? 1 : 0);
  }
  if (params.isStarred !== undefined) {
    where.push("a.is_starred = ?");
    values.push(params.isStarred ? 1 : 0);
  }
  if (params.search && params.search.trim()) {
    const term = params.search.trim().replace(/"/g, '""');
    where.push(
      "a.rowid IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?)",
    );
    values.push(`"${term}"`);
  }

  if (params.searchTerms) {
    const terms = [...new Set(params.searchTerms.map(t => t.trim()).filter(Boolean))].slice(0, 9);
    if (!terms.length) where.push("0");
    else {
      // instr treats %, _, quotes and SQL/FTS operators literally, including CJK substrings.
      const fields = ["a.title", "a.ai_title_ja", "a.ai_summary_short", "a.ai_tags", "a.content_plain"];
      where.push("(" + terms.flatMap(() => fields.map(f => `instr(lower(COALESCE(${f}, '')), lower(?)) > 0`)).join(" OR ") + ")");
      for (const term of terms) values.push(...fields.map(() => term));
      orderSql = "(" + terms.flatMap(() => fields.map((f,i) => `(CASE WHEN instr(lower(COALESCE(${f}, '')), lower(?)) > 0 THEN ${i < 2 ? 4 : i === 4 ? 1 : 2} ELSE 0 END)`)).join(" + ") + ") DESC, " + orderSql;
      for (const term of terms) orderValues.push(...fields.map(() => term));
    }
  }
  if (params.rankedIds) {
    where.push("a.id IN (SELECT value FROM json_each(?))");
    values.push(JSON.stringify(params.rankedIds));
    orderSql = "(SELECT key FROM json_each(?) WHERE value = a.id), a.id";
    orderValues.length = 0;
    orderValues.push(JSON.stringify(params.rankedIds));
  }
  const cursor = parseCursor(params.cursor);
  if (cursor) {
    where.push("(a.sort_key < ? OR (a.sort_key = ? AND a.id < ?))");
    values.push(cursor.sortKey, cursor.sortKey, cursor.id);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = rawDb
    .prepare(
      `SELECT a.*, f.title AS feed_title FROM articles a LEFT JOIN feeds f ON f.id = a.feed_id ${whereSql} ORDER BY ${orderSql} LIMIT ?`,
    )
    .all(...values, ...orderValues, limit + 1) as Record<string, unknown>[];

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const pageArticles = pageRows.map(rowToArticle);
  const last = pageArticles[pageArticles.length - 1];
  const nextCursor = hasMore && last ? makeCursor(last.sortKey, last.id) : null;

  const totalRow = rawDb
    .prepare<unknown[], { count: number }>(
      `SELECT COUNT(*) as count FROM articles a ${whereSql}`,
    )
    .get(...values);

  return {
    articles: pageArticles,
    nextCursor,
    total: totalRow?.count ?? 0,
  };
}
