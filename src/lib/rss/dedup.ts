import { createHash } from "node:crypto";

export interface RSSItemLike {
  guid?: string | null | undefined;
  link?: string | null | undefined;
  title?: string | null | undefined;
  pubDate?: string | null | undefined;
}

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of TRACKING_PARAMS) {
      u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function computeDedupHash(feedId: string, item: RSSItemLike): string {
  let source: string;

  if (item.guid && item.guid.trim() !== "") {
    source = item.guid.trim();
  } else if (item.link && item.link.trim() !== "") {
    source = normalizeUrl(item.link.trim());
  } else {
    source = `${(item.title ?? "").trim()}::${(item.pubDate ?? "").trim()}`;
  }

  return createHash("sha256")
    .update(`${feedId}:${source}`)
    .digest("hex")
    .slice(0, 32);
}
