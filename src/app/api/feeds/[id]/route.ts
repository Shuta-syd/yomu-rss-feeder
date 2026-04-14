import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles, feeds } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(64).optional(),
  fetchIntervalMin: z.number().int().min(5).max(1440).optional(),
  aiEnabled: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const { id } = await ctx.params;
    const json = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const existing = db.select().from(feeds).where(eq(feeds.id, id)).get();
    if (!existing) return jsonError(404, "Feed not found");

    db.update(feeds).set(parsed.data).where(eq(feeds.id, id)).run();

    // aiEnabled が変化した場合、このフィードの既存 pending/skipped 記事を切り替える
    if (parsed.data.aiEnabled !== undefined && parsed.data.aiEnabled !== existing.aiEnabled) {
      if (parsed.data.aiEnabled === false) {
        db.update(articles)
          .set({ aiStage1Status: "skipped" })
          .where(and(eq(articles.feedId, id), eq(articles.aiStage1Status, "pending")))
          .run();
      } else {
        db.update(articles)
          .set({ aiStage1Status: "pending" })
          .where(and(eq(articles.feedId, id), eq(articles.aiStage1Status, "skipped")))
          .run();
      }
    }

    const updated = db.select().from(feeds).where(eq(feeds.id, id)).get();
    return NextResponse.json(updated);
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const { id } = await ctx.params;
    const result = db.delete(feeds).where(eq(feeds.id, id)).run();
    if (result.changes === 0) return jsonError(404, "Feed not found");
    return new Response(null, { status: 204 });
  });
}
