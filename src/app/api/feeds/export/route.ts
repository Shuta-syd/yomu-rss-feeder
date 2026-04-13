import { db } from "@/lib/db";
import { feeds } from "@/lib/db/schema";
import { withAuth } from "@/lib/api-helpers";
import { generateOpml } from "@/lib/rss/opml-export";

/** GET /api/feeds/export — OPMLファイルとしてフィード一覧をエクスポートする */
export async function GET() {
  return withAuth(async () => {
    const rows = db
      .select({
        title: feeds.title,
        url: feeds.url,
        siteUrl: feeds.siteUrl,
        category: feeds.category,
      })
      .from(feeds)
      .all();

    const xml = generateOpml(rows);

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="yomu-feeds.opml"',
      },
    });
  });
}
