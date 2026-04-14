import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles, feeds } from "@/lib/db/schema";
import { withAuth } from "@/lib/api-helpers";

export async function GET() {
  return withAuth(async () => {
    const row = db
      .select({
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

    return NextResponse.json({
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
