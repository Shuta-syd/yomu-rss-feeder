import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { fetchReadablePage } from "@/lib/rss/fullcontent";

const readerSchema = z.object({
  url: z.string().url().max(2048),
});

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const json = await req.json().catch(() => null);
    const parsed = readerSchema.safeParse(json);
    if (!parsed.success) return jsonError(400, "Invalid request");

    const page = await fetchReadablePage(parsed.data.url);
    if (!page) return jsonError(422, "Readable content could not be extracted");

    return NextResponse.json({ page });
  });
}

