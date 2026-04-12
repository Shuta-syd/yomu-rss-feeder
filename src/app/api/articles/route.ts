import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import { listArticles } from "@/lib/articles-query";

export async function GET(req: NextRequest) {
  return withAuth(async () => {
    const sp = req.nextUrl.searchParams;
    const isRead = sp.get("isRead");
    const isStarred = sp.get("isStarred");
    const result = listArticles({
      feedId: sp.get("feedId") ?? undefined,
      isRead: isRead === null ? undefined : isRead === "true",
      isStarred: isStarred === null ? undefined : isStarred === "true",
      search: sp.get("search") ?? undefined,
      cursor: sp.get("cursor") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  });
}
