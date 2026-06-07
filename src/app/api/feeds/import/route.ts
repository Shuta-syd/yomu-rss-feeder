import { NextRequest, NextResponse } from "next/server";
import { v7 as uuidv7 } from "uuid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { feeds } from "@/lib/db/schema";
import { withAuth, jsonError } from "@/lib/api-helpers";
import { parseOpml } from "@/lib/rss/opml";
import { validateFeedUrl, fetchFeed } from "@/lib/rss/fetcher";

interface ImportError {
  url: string;
  error: string;
}

const MAX_OPML_BYTES = 2 * 1024 * 1024;
const MAX_OPML_ENTRIES = 500;

export async function POST(req: NextRequest) {
  return withAuth(async () => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return jsonError(400, "file required");
    if (file.size > MAX_OPML_BYTES) return jsonError(413, "OPML file is too large");

    const xml = await file.text();
    let entries;
    try {
      entries = parseOpml(xml);
    } catch (e) {
      return jsonError(422, `OPML parse failed: ${String(e)}`);
    }
    if (entries.length > MAX_OPML_ENTRIES) {
      return jsonError(413, `OPML contains too many feeds (max ${MAX_OPML_ENTRIES})`);
    }

    let imported = 0;
    let skipped = 0;
    const errors: ImportError[] = [];

    for (const entry of entries) {
      const dup = db.select().from(feeds).where(eq(feeds.url, entry.url)).get();
      if (dup) {
        skipped++;
        continue;
      }
      try {
        const meta = await validateFeedUrl(entry.url);
        const id = uuidv7();
        db.insert(feeds)
          .values({
            id,
            title: entry.title || meta.title,
            url: entry.url,
            siteUrl: meta.siteUrl,
            description: meta.description,
            category: entry.category,
          })
          .run();
        // インポート時の初回フェッチはバックグラウンド (await しない) で高速化
        fetchFeed(id, entry.url).catch((e) => {
          console.error("[yomu] initial fetch failed", entry.url, e);
        });
        imported++;
      } catch (e) {
        errors.push({ url: entry.url, error: String(e) });
      }
    }

    return NextResponse.json({ imported, skipped, errors });
  });
}
