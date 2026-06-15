import { db } from "../db";
import { feeds } from "../db/schema";
import { fetchFeedWithOptions, shouldFetch, type FetchResult } from "./fetcher";
import { acquireSyncLock, refreshSyncLock, releaseSyncLock } from "./sync-lock";
import { readPositiveIntEnv } from "../env";

const SYNC_MAX_DURATION_MS = readPositiveIntEnv("YOMU_SYNC_MAX_DURATION_MS", 8 * 60 * 1000);

export interface SyncSummary {
  locked?: boolean;
  aborted?: boolean;
  updated: number;
  skipped: number;
  newArticles: number;
  errors: { feedId: string; feedUrl: string; error: string }[];
  results: FetchResult[];
}

export async function syncAllFeeds(options?: { feedId?: string }): Promise<SyncSummary> {
  const lock = acquireSyncLock();
  if (!lock) {
    return {
      locked: true,
      updated: 0,
      skipped: 0,
      newArticles: 0,
      errors: [],
      results: [],
    };
  }
  const startedAt = Date.now();
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

    for (const [index, feed] of targets.entries()) {
      const elapsed = Date.now() - startedAt;
      if (elapsed > SYNC_MAX_DURATION_MS) {
        summary.aborted = true;
        console.warn(
          `[yomu] sync duration limit reached elapsed=${elapsed}ms max=${SYNC_MAX_DURATION_MS}ms processed=${index}/${targets.length}`,
        );
        break;
      }
      if (!refreshSyncLock(lock)) {
        summary.aborted = true;
        console.warn(`[yomu] sync lock lost; aborting processed=${index}/${targets.length}`);
        break;
      }

      // 手動指定時は interval を無視して強制取得
      if (!options?.feedId && !shouldFetch(feed)) {
        summary.skipped++;
        continue;
      }

      const feedStartedAt = Date.now();
      console.log(`[yomu] sync feed start feedId=${feed.id} url=${feed.url}`);
      const result = await fetchFeedWithOptions(feed.id, feed.url);
      if (!refreshSyncLock(lock)) {
        summary.aborted = true;
        console.warn(`[yomu] sync lock lost after feed feedId=${feed.id}; aborting`);
      }
      summary.results.push(result);
      if (result.ok) {
        summary.updated++;
        summary.newArticles += result.newArticles;
      } else {
        summary.errors.push({
          feedId: feed.id,
          feedUrl: feed.url,
          error: result.error ?? "unknown",
        });
      }

      console.log(
        `[yomu] sync feed done feedId=${feed.id} ok=${result.ok} new=${result.newArticles} items=${result.processedItems} skippedExisting=${result.skippedExisting} limited=${result.limited} elapsed=${Date.now() - feedStartedAt}ms`,
      );
      if (summary.aborted) break;
    }

    return summary;
  } finally {
    releaseSyncLock(lock);
  }
}
