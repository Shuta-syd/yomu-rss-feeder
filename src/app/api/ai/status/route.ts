import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles } from "@/lib/db/schema";
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

    return NextResponse.json({
      pending: row?.pending ?? 0,
      processing: row?.processing ?? 0,
      done: row?.done ?? 0,
      failed: row?.failed ?? 0,
      total: row?.total ?? 0,
    });
  });
}
