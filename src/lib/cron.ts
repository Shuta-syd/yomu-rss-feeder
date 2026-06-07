import cron from "node-cron";
import { syncAllFeeds } from "./rss/sync";
import { getPendingStage1Ids, processStage1ForArticles } from "./llm/stage1";
import { initVapid, sendPushToAll } from "./push";

const TICK = "*/5 * * * *";

let started = false;

export function initCron(): void {
  if (started) return;
  started = true;
  initVapid();

  cron.schedule(TICK, async () => {
    const startedAt = Date.now();
    try {
      const summary = await syncAllFeeds();
      if (summary.locked) {
        console.log("[yomu] cron tick: another sync in progress, skipping");
        return;
      }

      // pending状態の記事があればStage1処理を実行
      const pendingIds = getPendingStage1Ids(500);
      if (pendingIds.length > 0) {
        try {
          await processStage1ForArticles(pendingIds);
          console.log(`[yomu] stage1: processed ${pendingIds.length} pending articles`);
        } catch (e) {
          console.error("[yomu] stage1 pending batch failed", e);
        }
      }

      // 新着記事があればPush通知
      if (summary.newArticles > 0) {
        sendPushToAll("Yomu", `新しい記事が${summary.newArticles}件あります`).catch((e) =>
          console.error("[yomu] push notification failed", e),
        );
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
