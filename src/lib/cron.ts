import cron from "node-cron";
import { syncAllFeeds } from "./rss/sync";
import { getPendingStage1Ids, processStage1ForArticles } from "./llm/stage1";

const TICK = "*/5 * * * *";

let started = false;

export function initCron(): void {
  if (started) return;
  started = true;

  cron.schedule(TICK, async () => {
    const startedAt = Date.now();
    try {
      const summary = await syncAllFeeds();
      if (summary.locked) {
        console.log("[yomu] cron tick: another sync in progress, skipping");
        return;
      }

      // pending状態の記事があればStage1処理を実行
      const pendingIds = getPendingStage1Ids(50);
      if (pendingIds.length > 0) {
        try {
          await processStage1ForArticles(pendingIds);
          console.log(`[yomu] stage1: processed ${pendingIds.length} pending articles`);
        } catch (e) {
          console.error("[yomu] stage1 pending batch failed", e);
        }
      }

      const elapsed = Date.now() - startedAt;
      console.log(
        `[yomu] cron tick: updated=${summary.updated} skipped=${summary.skipped} new=${summary.newArticles} errors=${summary.errors.length} (${elapsed}ms)`,
      );
    } catch (e) {
      console.error("[yomu] cron tick failed", e);
    }
  });
}
