import { NextRequest, NextResponse } from "next/server";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { xLikes } from "@/lib/db/schema";
import { desc, lt, or, and, eq } from "drizzle-orm";
import { fetchAndStoreLikes } from "@/lib/x/likes";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function parseCursor(cursor: string | undefined): { likedAt: number; id: string } | null {
  if (!cursor) return null;
  const idx = cursor.indexOf("_");
  if (idx < 0) return null;
  const likedAt = Number.parseInt(cursor.slice(0, idx), 10);
  const id = cursor.slice(idx + 1);
  if (!Number.isFinite(likedAt) || !id) return null;
  return { likedAt, id };
}

export async function GET(req: NextRequest) {
  return withAuth(async () => {
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(Math.max(Number(sp.get("limit")) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const cur = parseCursor(sp.get("cursor") ?? undefined);

    const conditions = cur
      ? or(
          lt(xLikes.likedAt, cur.likedAt),
          and(eq(xLikes.likedAt, cur.likedAt), lt(xLikes.id, cur.id)),
        )
      : undefined;

    const rows = db
      .select()
      .from(xLikes)
      .where(conditions)
      .orderBy(desc(xLikes.likedAt), desc(xLikes.id))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? `${items[items.length - 1]!.likedAt}_${items[items.length - 1]!.id}`
      : null;

    return NextResponse.json({ likes: items, nextCursor });
  });
}

export async function POST() {
  return withAuth(async () => {
    try {
      const fetched = await fetchAndStoreLikes();
      return NextResponse.json({ fetched });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return jsonError(500, message);
    }
  });
}
