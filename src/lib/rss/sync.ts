import { db } from "../db";
import { feeds } from "../db/schema";
import { fetchFeed, shouldFetch, type FetchResult } from "./fetcher";
import { acquireSyncLock, releaseSyncLock } from "./sync-lock";
import { processStage1ForArticles } from "../llm/stage1";

export interface SyncSummary {
  locked?: boolean;
  updated: number;
  skipped: number;
  newArticles: number;
  errors: { feedId: string; error: string }[];
  results: FetchResult[];
}

export async function syncAllFeeds(options?: { feedId?: string }): Promise<SyncSummary> {
  if (!acquireSyncLock()) {
    return {
      locked: true,
      updated: 0,
      skipped: 0,
      newArticles: 0,
      errors: [],
      results: [],
    };
  }
  try {
    const all = db.select().from(feeds).all();
    const targets = options?.feedId
      ? all.filter((f) => f.id === options.feedId)
      : all;

    const summary: SyncSummary = {
      updated: 0,
      skipped: 0,
      newArticles: 0,
      errors: [],
      results: [],
    };

    for (const feed of targets) {
      // 手動指定時は interval を無視して強制取得
      if (!options?.feedId && !shouldFetch(feed)) {
        summary.skipped++;
        continue;
      }
      const result = await fetchFeed(feed.id, feed.url);
      summary.results.push(result);
      if (result.ok) {
        summary.updated++;
        summary.newArticles += result.newArticles;
      } else {
        summary.errors.push({ feedId: feed.id, error: result.error ?? "unknown" });
      }
    }

    // 新規記事の Stage1 AI 処理 (ロック保持中に同期実行)
    const allNewIds = summary.results.flatMap((r) => r.newArticleIds);
    if (allNewIds.length > 0) {
      try {
        await processStage1ForArticles(allNewIds);
      } catch (e) {
        console.error("[yomu] stage1 batch failed", e);
      }
    }

    return summary;
  } finally {
    releaseSyncLock();
  }
}
