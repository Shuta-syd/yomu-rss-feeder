import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { fetchReadablePageResult } from "@/lib/rss/fullcontent";

const readerSchema = z.object({
  url: z.string().url().max(2048),
});

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const json = await req.json().catch(() => null);
    const parsed = readerSchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const result = await fetchReadablePageResult(parsed.data.url);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: "Readable content could not be extracted",
          reason: result.reason,
          message: result.message,
          finalUrl: result.finalUrl,
          status: result.status,
          contentType: result.contentType,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ page: result.page });
  });
}
