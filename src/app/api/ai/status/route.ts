import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, rawDb } from "@/lib/db";
import { articles, feeds } from "@/lib/db/schema";
import {getSettings} from "@/lib/settings";
import {aiPauseReason,aiFailureReason,type AIFailureCounts} from "@/lib/update-status";
import { withAuth } from "@/lib/api-helpers";

export async function GET() {
  return withAuth(async () => {
    const row = db
      .select({
        budgetWaiting: sql<number>`SUM(CASE WHEN ${articles.aiStage1Status} = 'pending' AND ${articles.aiStage1Error} LIKE 'AIの概算予算上限%' THEN 1 ELSE 0 END)`,
        pricingWaiting: sql<number>`SUM(CASE WHEN ${articles.aiStage1Status} = 'pending' AND ${articles.aiStage1Error} LIKE 'このモデルの単価が未登録%' THEN 1 ELSE 0 END)`,
        pending: sql<number>`SUM(CASE WHEN ${articles.aiStage1Status} = 'pending' THEN 1 ELSE 0 END)`,
        processing: sql<number>`SUM(CASE WHEN ${articles.aiStage1Status} = 'processing' THEN 1 ELSE 0 END)`,
        done: sql<number>`SUM(CASE WHEN ${articles.aiStage1Status} = 'done' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN ${articles.aiStage1Status} = 'failed' THEN 1 ELSE 0 END)`,
        total: sql<number>`COUNT(*)`,
      })
      .from(articles)
      .get();

    const current = db
      .select({
        title: articles.title,
        feedTitle: feeds.title,
      })
      .from(articles)
      .leftJoin(feeds, eq(feeds.id, articles.feedId))
      .where(eq(articles.aiStage1Status, "processing"))
      .limit(1)
      .get();

    const failureCounts:AIFailureCounts={billing:0,format:0,temporary:0,other:0};
    const failures=rawDb.prepare("SELECT ai_stage1_error error,count(*) n,max(ai_stage1_processed_at) last FROM articles WHERE ai_stage1_status='failed' GROUP BY ai_stage1_error").all() as {error:string|null;n:number;last:number|null}[];
    let lastFailureAt:number|null=null;
    for(const row of failures){failureCounts[aiFailureReason(row.error)]+=row.n;if(row.last!==null)lastFailureAt=Math.max(lastFailureAt??0,row.last);}
    const settings=getSettings();
    const hasKey={gemini:settings.hasGeminiApiKey,openai:settings.hasOpenaiApiKey,anthropic:settings.hasAnthropicApiKey}[settings.stage1Provider];
    const pauseReason=aiPauseReason({pending:row?.pending??0,processing:row?.processing??0,budgetWaiting:row?.budgetWaiting??0,pricingWaiting:row?.pricingWaiting??0},hasKey);
    return NextResponse.json({
      pauseReason, failureCounts, lastFailureAt,
      pending: row?.pending ?? 0,
      processing: row?.processing ?? 0,
      done: row?.done ?? 0,
      failed: row?.failed ?? 0,
      total: row?.total ?? 0,
      currentTitle: current?.title ?? null,
      currentFeedTitle: current?.feedTitle ?? null,
    });
  });
}
