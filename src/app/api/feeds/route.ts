import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v7 as uuidv7 } from "uuid";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { feeds, articles } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { validateFeedUrl, fetchFeed } from "@/lib/rss/fetcher";

export async function GET() {
  return withAuth(async () => {
    const rows = db
      .select({
        id: feeds.id,
        title: feeds.title,
        url: feeds.url,
        siteUrl: feeds.siteUrl,
        category: feeds.category,
        faviconUrl: feeds.faviconUrl,
        fetchIntervalMin: feeds.fetchIntervalMin,
        lastFetchedAt: feeds.lastFetchedAt,
        lastFetchStatus: feeds.lastFetchStatus,
        consecutiveFetchFailures: feeds.consecutiveFetchFailures,
        unreadCount: sql<number>`COALESCE(SUM(CASE WHEN ${articles.isRead} = 0 THEN 1 ELSE 0 END), 0)`,
      })
      .from(feeds)
      .leftJoin(articles, eq(articles.feedId, feeds.id))
      .groupBy(feeds.id)
      .all();
    return NextResponse.json({ feeds: rows });
  });
}

const addSchema = z.object({
  url: z.string().url(),
  category: z.string().min(1).max(64).optional(),
});

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const json = await req.json().catch(() => null);
    const parsed = addSchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const existing = db
      .select()
      .from(feeds)
      .where(eq(feeds.url, parsed.data.url))
      .get();
    if (existing) return jsonError(409, "Feed already exists");

    let meta;
    try {
      meta = await validateFeedUrl(parsed.data.url);
    } catch (e) {
      return NextResponse.json(
        { error: "Failed to parse feed", detail: String(e) },
        { status: 422 },
      );
    }

    const id = uuidv7();
    db.insert(feeds)
      .values({
        id,
        title: meta.title,
        url: parsed.data.url,
        siteUrl: meta.siteUrl,
        description: meta.description,
        category: parsed.data.category ?? "未分類",
      })
      .run();

    // 初回フェッチは fire-and-forget ではなく、記事が即座に見えるよう待つ
    await fetchFeed(id, parsed.data.url);

    const row = db.select().from(feeds).where(eq(feeds.id, id)).get();
    return NextResponse.json(row, { status: 201 });
  });
}

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
});

export async function DELETE(req: NextRequest) {
  return withAuth(async () => {
    const json = await req.json().catch(() => null);
    const parsed = bulkDeleteSchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const result = db
      .delete(feeds)
      .where(inArray(feeds.id, parsed.data.ids))
      .run();
    return NextResponse.json({ deleted: result.changes });
  });
}
