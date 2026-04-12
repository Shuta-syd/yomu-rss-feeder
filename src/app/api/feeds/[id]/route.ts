import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { feeds } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(64).optional(),
  fetchIntervalMin: z.number().int().min(5).max(1440).optional(),
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
