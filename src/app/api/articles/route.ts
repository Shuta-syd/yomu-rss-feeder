import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import { listArticles } from "@/lib/articles-query";

function normalize(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function GET(req: NextRequest) {
  return withAuth(async () => {
    const sp = req.nextUrl.searchParams;
    const isRead = sp.get("isRead");
    const isStarred = sp.get("isStarred");
    const result = listArticles({
      feedId: normalize(sp.get("feedId")),
      category: normalize(sp.get("category")),
      classifications: sp.getAll("classification").filter(Boolean).slice(0, 3),
      isRead: isRead === null ? undefined : isRead === "true",
      isReadLater: sp.has("isReadLater") ? sp.get("isReadLater") === "true" : undefined,
      isStarred: isStarred === null ? undefined : isStarred === "true",
      search: sp.get("search") ?? undefined,
      cursor: sp.get("cursor") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  });
}
