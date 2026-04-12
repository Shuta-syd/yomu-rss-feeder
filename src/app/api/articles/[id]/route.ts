import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const { id } = await ctx.params;
    const row = db.select().from(articles).where(eq(articles.id, id)).get();
    if (!row) return jsonError(404, "Not found");
    return NextResponse.json(row);
  });
}

const patchSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
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

    const updates: Partial<typeof articles.$inferInsert> = { ...parsed.data };
    if (parsed.data.isRead === true && !existing.isRead) {
      updates.readAt = Date.now();
    }
    if (parsed.data.isRead === false) {
      updates.readAt = null;
    }

    db.update(articles).set(updates).where(eq(articles.id, id)).run();
    const updated = db.select().from(articles).where(eq(articles.id, id)).get();
    return NextResponse.json(updated);
  });
}
