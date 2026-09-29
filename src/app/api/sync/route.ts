import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { syncAllFeeds } from "@/lib/rss/sync";

const bodySchema = z
  .object({ feedId: z.string().min(1).max(80).optional(), failedOnly: z.boolean().optional() })
  .refine(value=>!(value.feedId&&value.failedOnly),"Choose one retry target")
  .optional();

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const text=await req.text();
    const json=text?await Promise.resolve().then(()=>JSON.parse(text)).catch(()=>null):{};
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const summary = await syncAllFeeds({ feedId: parsed.data?.feedId, failedOnly: parsed.data?.failedOnly });
    if (summary.locked) {
      return NextResponse.json(
        { error: "フィードを更新中です。完了してから再試行してください。" },
        { status: 409 },
      );
    }
    return NextResponse.json(summary);
  });
}
