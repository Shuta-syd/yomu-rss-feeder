import { describe, it, expect } from "vitest";
import { parseOpml } from "@/lib/rss/opml";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Subs</title></head>
  <body>
    <outline title="Tech">
      <outline type="rss" text="HN" title="Hacker News" xmlUrl="https://news.ycombinator.com/rss"/>
      <outline type="rss" text="Lobsters" xmlUrl="https://lobste.rs/rss"/>
    </outline>
    <outline type="rss" text="Solo" xmlUrl="https://example.com/feed.xml"/>
  </body>
</opml>`;

describe("parseOpml", () => {
  it("ネストしたカテゴリを抽出", () => {
    const entries = parseOpml(SAMPLE);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      url: "https://news.ycombinator.com/rss",
      title: "Hacker News",
      category: "Tech",
    });
    expect(entries[1]!.category).toBe("Tech");
    expect(entries[2]!.category).toBe("未分類");
  });

  it("xmlUrl のない outline はスキップ", () => {
    const xml = `<opml><body><outline title="Empty"/></body></opml>`;
    expect(parseOpml(xml)).toEqual([]);
  });
});
