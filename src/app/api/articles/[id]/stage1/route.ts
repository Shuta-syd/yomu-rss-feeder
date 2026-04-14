import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { processStage1ForArticles } from "@/lib/llm/stage1";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const { id } = await ctx.params;
    const article = db.select().from(articles).where(eq(articles.id, id)).get();
    if (!article) return jsonError(404, "Not found");
    if (article.aiStage1Status === "processing") {
      return jsonError(409, "Already processing");
    }

    // pending に戻してから単体処理を実行
    db.update(articles)
      .set({ aiStage1Status: "pending", aiStage1Error: null })
      .where(eq(articles.id, id))
      .run();

    try {
      await processStage1ForArticles([id]);
    } catch (e) {
      return jsonError(500, e instanceof Error ? e.message : String(e));
    }

    const updated = db.select().from(articles).where(eq(articles.id, id)).get();
    return NextResponse.json(updated);
  });
}
