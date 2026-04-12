import { describe, it, expect } from "vitest";
import { generateOpml } from "@/lib/rss/opml-export";

describe("generateOpml", () => {
  it("フィード一覧からOPML XMLを生成できる", () => {
    const feeds = [
      {
        title: "Hacker News",
        url: "https://news.ycombinator.com/rss",
        siteUrl: "https://news.ycombinator.com",
        category: "Tech",
      },
      {
        title: "Lobsters",
        url: "https://lobste.rs/rss",
        siteUrl: null,
        category: "Tech",
      },
    ];

    const xml = generateOpml(feeds);

    // OPMLヘッダー
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<opml version="2.0">');
    expect(xml).toContain("</opml>");
    expect(xml).toContain("<head>");
    expect(xml).toContain("<body>");

    // カテゴリoutline
    expect(xml).toContain('text="Tech"');

    // フィード属性
    expect(xml).toContain('type="rss"');
    expect(xml).toContain('title="Hacker News"');
    expect(xml).toContain('xmlUrl="https://news.ycombinator.com/rss"');
    expect(xml).toContain('htmlUrl="https://news.ycombinator.com"');

    // siteUrlがnullの場合はhtmlUrl属性なし
    const lobstersLine = xml
      .split("\n")
      .find((l) => l.includes("Lobsters"));
    expect(lobstersLine).toBeDefined();
    expect(lobstersLine).not.toContain("htmlUrl");
  });

  it("カテゴリごとにグルーピングされる（同じカテゴリのoutlineは1つだけ）", () => {
    const feeds = [
      { title: "Feed A", url: "https://a.com/rss", siteUrl: null, category: "Tech" },
      { title: "Feed B", url: "https://b.com/rss", siteUrl: null, category: "Tech" },
      { title: "Feed C", url: "https://c.com/rss", siteUrl: null, category: "News" },
    ];

    const xml = generateOpml(feeds);

    // "Tech" カテゴリの outline タグが1つだけ
    const techMatches = xml.match(/text="Tech"/g);
    expect(techMatches).toHaveLength(1);

    // "News" カテゴリの outline タグが1つだけ
    const newsMatches = xml.match(/text="News"/g);
    expect(newsMatches).toHaveLength(1);

    // フィードはすべて含まれる
    expect(xml).toContain("Feed A");
    expect(xml).toContain("Feed B");
    expect(xml).toContain("Feed C");
  });

  it("空配列で有効なOPMLを返す", () => {
    const xml = generateOpml([]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<opml version="2.0">');
    expect(xml).toContain("<body>");
    expect(xml).toContain("</body>");
    expect(xml).toContain("</opml>");
    // フィードのoutlineは含まれない
    expect(xml).not.toContain('type="rss"');
  });

  it("XMLエスケープが正しく機能する（& < > \" ' を含むタイトル）", () => {
    const feeds = [
      {
        title: "A & B <News> \"quotes\" 'apos'",
        url: "https://example.com/rss",
        siteUrl: "https://example.com",
        category: "Tech & Science",
      },
    ];

    const xml = generateOpml(feeds);

    // タイトルのエスケープ
    expect(xml).toContain("A &amp; B &lt;News&gt; &quot;quotes&quot; &apos;apos&apos;");
    // カテゴリのエスケープ
    expect(xml).toContain("Tech &amp; Science");
    // エスケープ前の生文字は属性値に含まれない
    expect(xml).not.toContain('title="A & B');
  });

  it("カテゴリがアルファベット順にソートされる", () => {
    const feeds = [
      { title: "Feed Z", url: "https://z.com/rss", siteUrl: null, category: "Zebra" },
      { title: "Feed A", url: "https://a.com/rss", siteUrl: null, category: "Apple" },
      { title: "Feed M", url: "https://m.com/rss", siteUrl: null, category: "Mango" },
    ];

    const xml = generateOpml(feeds);

    const applePos = xml.indexOf('"Apple"');
    const mangoPos = xml.indexOf('"Mango"');
    const zebraPos = xml.indexOf('"Zebra"');

    expect(applePos).toBeLessThan(mangoPos);
    expect(mangoPos).toBeLessThan(zebraPos);
  });
});
