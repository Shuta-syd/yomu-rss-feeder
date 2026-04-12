import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { syncAllFeeds } from "@/lib/rss/sync";

const bodySchema = z
  .object({ feedId: z.string().optional() })
  .optional();

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const summary = await syncAllFeeds({ feedId: parsed.data?.feedId });
    if (summary.locked) {
      return NextResponse.json(
        { error: "Sync in progress. Try again shortly." },
        { status: 409 },
      );
    }
    return NextResponse.json(summary);
  });
}
