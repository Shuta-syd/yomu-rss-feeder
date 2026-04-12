import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { feeds } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";

const renameSchema = z.object({
  oldName: z.string().min(1).max(64),
  newName: z.string().min(1).max(64),
});

export async function PATCH(req: NextRequest) {
  return withAuth(async () => {
    const json = await req.json().catch(() => null);
    const parsed = renameSchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const result = db
      .update(feeds)
      .set({ category: parsed.data.newName })
      .where(eq(feeds.category, parsed.data.oldName))
      .run();

    if (result.changes === 0) return jsonError(404, "Category not found");
    return NextResponse.json({ ok: true, updated: result.changes });
  });
}
