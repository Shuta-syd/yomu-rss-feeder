import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-helpers";
import { getSettings } from "@/lib/settings";
import { searchWithJev, JevSearchError } from "@/lib/jev-search";
import { LLMBudgetError } from "@/lib/llm/usage";
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
    const limitValue = sp.get("limit");
    if (limitValue !== null && (!/^\d+$/.test(limitValue) || Number(limitValue) < 1 || Number(limitValue) > 100)) return NextResponse.json({error:"limitは1〜100で指定してください。"}, {status:400});
    const params = {
      feedId: normalize(sp.get("feedId")),
      category: normalize(sp.get("category")),
      classifications: sp.getAll("classification").filter(Boolean).slice(0, 3),
      isRead: isRead === null ? undefined : isRead === "true",
      isReadLater: sp.has("isReadLater") ? sp.get("isReadLater") === "true" : undefined,
      isStarred: isStarred === null ? undefined : isStarred === "true",
      search: sp.get("search") ?? undefined,
      cursor: sp.get("cursor") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    };
    const useJev = Boolean(params.search?.trim()) && getSettings().jevSearchEnabled && sp.get("searchMode") !== "keyword";
    if (!useJev && params.cursor?.startsWith("jev:")) return NextResponse.json({error:"検索方式が変わりました。もう一度検索してください。"},{status:409});
    try {
      const result = useJev ? await searchWithJev(params, {incremental:true, jobId:sp.get("searchJob") ?? undefined}) : listArticles(params);
      return NextResponse.json(result, {status:"pending" in result && result.pending ? 202 : 200, headers:{"Cache-Control":"no-store"}});
    } catch (error) {
      if (!useJev) throw error;
      const message = error instanceof JevSearchError || error instanceof LLMBudgetError ? error.message : "Jev検索を完了できませんでした。JevのAPIキーを確認するか、通常検索を使ってください。";
      return NextResponse.json({error:message}, {status:error instanceof JevSearchError ? error.status : 503});
    }
  });
}
