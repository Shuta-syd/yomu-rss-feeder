import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedSites } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(64).optional(),
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

    const existing = db.select().from(savedSites).where(eq(savedSites.id, id)).get();
    if (!existing) return jsonError(404, "Site not found");

    db.update(savedSites).set(parsed.data).where(eq(savedSites.id, id)).run();
    const updated = db.select().from(savedSites).where(eq(savedSites.id, id)).get();
    return NextResponse.json(updated);
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuth(async () => {
    const { id } = await ctx.params;
    const result = db.delete(savedSites).where(eq(savedSites.id, id)).run();
    if (result.changes === 0) return jsonError(404, "Site not found");
    return new Response(null, { status: 204 });
  });
}
