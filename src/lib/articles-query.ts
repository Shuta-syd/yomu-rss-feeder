import { rawDb } from "./db";
import type { Article } from "./db/schema";

export interface ArticleListParams {
  feedId?: string;
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ArticleListResult {
  articles: Article[];
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

function rowToArticle(row: Record<string, unknown>): Article {
  return {
    id: row["id"] as string,
    feedId: row["feed_id"] as string,
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
    isStarred: Boolean(row["is_starred"]),
    readAt: (row["read_at"] as number | null) ?? null,
    aiSummaryShort: (row["ai_summary_short"] as string | null) ?? null,
    aiTitleJa: (row["ai_title_ja"] as string | null) ?? null,
    aiTags: (row["ai_tags"] as string | null) ?? null,
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
    createdAt: row["created_at"] as number,
  };
}

export function listArticles(params: ArticleListParams): ArticleListResult {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const where: string[] = [];
  const values: unknown[] = [];

  if (params.feedId) {
    where.push("feed_id = ?");
    values.push(params.feedId);
  }
  if (params.isRead !== undefined) {
    where.push("is_read = ?");
    values.push(params.isRead ? 1 : 0);
  }
  if (params.isStarred !== undefined) {
    where.push("is_starred = ?");
    values.push(params.isStarred ? 1 : 0);
  }
  if (params.search && params.search.trim()) {
    const term = params.search.trim().replace(/"/g, '""');
    where.push(
      "rowid IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?)",
    );
    values.push(`"${term}"`);
  }

  const cursor = parseCursor(params.cursor);
  if (cursor) {
    where.push("(sort_key < ? OR (sort_key = ? AND id < ?))");
    values.push(cursor.sortKey, cursor.sortKey, cursor.id);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = rawDb
    .prepare(
      `SELECT * FROM articles ${whereSql} ORDER BY sort_key DESC, id DESC LIMIT ?`,
    )
    .all(...values, limit + 1) as Record<string, unknown>[];

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const pageArticles = pageRows.map(rowToArticle);
  const last = pageArticles[pageArticles.length - 1];
  const nextCursor = hasMore && last ? makeCursor(last.sortKey, last.id) : null;

  const totalRow = rawDb
    .prepare<unknown[], { count: number }>(
      `SELECT COUNT(*) as count FROM articles ${whereSql}`,
    )
    .get(...values);

  return {
    articles: pageArticles,
    nextCursor,
    total: totalRow?.count ?? 0,
  };
}
