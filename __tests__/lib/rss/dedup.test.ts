import { describe, it, expect } from "vitest";
import { computeDedupHash, normalizeUrl } from "@/lib/rss/dedup";

describe("computeDedupHash", () => {
  const feedId = "feed-001";

  it("guidがあればguidベース (32文字)", () => {
    const h = computeDedupHash(feedId, {
      guid: "abc-123",
      link: "https://example.com/1",
      title: "Test",
    });
    expect(h).toHaveLength(32);
  });

  it("同じguidは同じハッシュ (link/titleは無視)", () => {
    const h1 = computeDedupHash(feedId, { guid: "abc-123", link: "", title: "" });
    const h2 = computeDedupHash(feedId, {
      guid: "abc-123",
      link: "https://other.com",
      title: "Other",
    });
    expect(h1).toBe(h2);
  });

  it("guidがなければURLベース。utm除去後に一致", () => {
    const h1 = computeDedupHash(feedId, {
      guid: "",
      link: "https://example.com/post?utm_source=twitter",
      title: "",
    });
    const h2 = computeDedupHash(feedId, {
      guid: "",
      link: "https://example.com/post",
      title: "",
    });
    expect(h1).toBe(h2);
  });

  it("異なるフィードの同じguidは異なるハッシュ", () => {
    const h1 = computeDedupHash("feed-001", { guid: "abc", link: "", title: "" });
    const h2 = computeDedupHash("feed-002", { guid: "abc", link: "", title: "" });
    expect(h1).not.toBe(h2);
  });

  it("guidもlinkもなければtitle+pubDateベース", () => {
    const h1 = computeDedupHash(feedId, {
      guid: "",
      link: "",
      title: "Hello",
      pubDate: "2026-04-11",
    });
    const h2 = computeDedupHash(feedId, {
      guid: "",
      link: "",
      title: "Hello",
      pubDate: "2026-04-11",
    });
    expect(h1).toBe(h2);
  });

  it("guid優先度: guid > link > title", () => {
    const withGuid = computeDedupHash(feedId, {
      guid: "g1",
      link: "https://example.com",
      title: "T",
    });
    const withLink = computeDedupHash(feedId, {
      guid: "",
      link: "https://example.com",
      title: "T",
    });
    expect(withGuid).not.toBe(withLink);
  });
});

describe("normalizeUrl", () => {
  it("hashを除去", () => {
    expect(normalizeUrl("https://example.com/a#section")).toBe("https://example.com/a");
  });

  it("UTMパラメータを除去しつつ他のクエリは保持", () => {
    expect(
      normalizeUrl("https://example.com/a?utm_source=x&id=42&utm_medium=y"),
    ).toBe("https://example.com/a?id=42");
  });

  it("不正URLはそのまま返す", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});
