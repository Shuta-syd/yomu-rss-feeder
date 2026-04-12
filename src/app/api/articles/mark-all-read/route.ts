import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";

const bodySchema = z
  .object({ feedId: z.string().optional() })
  .optional();

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const where = parsed.data?.feedId
      ? and(eq(articles.feedId, parsed.data.feedId), eq(articles.isRead, false))
      : eq(articles.isRead, false);

    const result = db
      .update(articles)
      .set({ isRead: true, readAt: Date.now() })
      .where(where)
      .run();
    return NextResponse.json({ updated: result.changes });
  });
}
