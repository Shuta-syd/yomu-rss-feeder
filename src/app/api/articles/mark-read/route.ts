import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";

const bodySchema = z.object({
  articleIds: z.array(z.string()).min(1).max(1000),
});

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const result = db
      .update(articles)
      .set({ isRead: true, readAt: Date.now() })
      .where(inArray(articles.id, parsed.data.articleIds))
      .run();
    return NextResponse.json({ updated: result.changes });
  });
}
