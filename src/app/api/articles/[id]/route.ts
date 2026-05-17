import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, rawDb } from "@/lib/db";
import { articles } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { rowToArticle } from "@/lib/articles-query";

function loadArticleDTO(id: string) {
  return rawDb
    .prepare(
      "SELECT a.*, f.title AS feed_title FROM articles a LEFT JOIN feeds f ON f.id = a.feed_id WHERE a.id = ?",
    )
    .get(id) as Record<string, unknown> | undefined;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const { id } = await ctx.params;
    const row = loadArticleDTO(id);
    if (!row) return jsonError(404, "Not found");
    return NextResponse.json(rowToArticle(row));
  });
}

const patchSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  note: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const { id } = await ctx.params;
    const json = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const existing = db.select().from(articles).where(eq(articles.id, id)).get();
    if (!existing) return jsonError(404, "Not found");

    const updates: Partial<typeof articles.$inferInsert> = {};
    if (parsed.data.isRead !== undefined) updates.isRead = parsed.data.isRead;
    if (parsed.data.isStarred !== undefined) updates.isStarred = parsed.data.isStarred;
    if ("note" in parsed.data) {
      const trimmed = parsed.data.note?.trim();
      updates.note = trimmed ? trimmed : null;
    }
    if (parsed.data.isRead === true && !existing.isRead) {
      updates.readAt = Date.now();
    }
    if (parsed.data.isRead === false) {
      updates.readAt = null;
    }

    if (Object.keys(updates).length > 0) {
      db.update(articles).set(updates).where(eq(articles.id, id)).run();
    }

    const row = loadArticleDTO(id);
    if (!row) return jsonError(404, "Not found");
    return NextResponse.json(rowToArticle(row));
  });
}
