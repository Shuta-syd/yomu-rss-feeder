import { describe, it, expect } from "vitest";
import { buildArticlesParams } from "@/lib/articles-params";

describe("buildArticlesParams", () => {
  it("空入力では何も含まない", () => {
    const params = buildArticlesParams({});
    expect(params.toString()).toBe("");
  });

  it("feedId を含める", () => {
    const params = buildArticlesParams({ feedId: "abc" });
    expect(params.get("feedId")).toBe("abc");
    expect(params.has("category")).toBe(false);
  });

  it("category を含める (feedId が無いとき)", () => {
    const params = buildArticlesParams({ category: "BLOG" });
    expect(params.get("category")).toBe("BLOG");
  });

  it("feedId と category 両方指定時は feedId 優先 (category は付けない)", () => {
    const params = buildArticlesParams({ feedId: "f1", category: "BLOG" });
    expect(params.get("feedId")).toBe("f1");
    expect(params.has("category")).toBe(false);
  });

  it("readFilter='unread' で isRead=false", () => {
    const params = buildArticlesParams({ readFilter: "unread" });
    expect(params.get("isRead")).toBe("false");
  });

  it("readFilter='read' で isRead=true", () => {
    const params = buildArticlesParams({ readFilter: "read" });
    expect(params.get("isRead")).toBe("true");
  });

  it("readFilter='all' では isRead を含めない", () => {
    const params = buildArticlesParams({ readFilter: "all" });
    expect(params.has("isRead")).toBe(false);
  });

  it("view='starred' で isStarred=true", () => {
    const params = buildArticlesParams({ view: "starred" });
    expect(params.get("isStarred")).toBe("true");
  });

  it("search を trim して含める", () => {
    const params = buildArticlesParams({ search: "  hello  " });
    expect(params.get("search")).toBe("hello");
  });

  it("空 search は含めない", () => {
    const params = buildArticlesParams({ search: "   " });
    expect(params.has("search")).toBe(false);
  });

  it("cursor を含める", () => {
    const params = buildArticlesParams({ cursor: "123_abc" });
    expect(params.get("cursor")).toBe("123_abc");
  });

  it("全部入り", () => {
    const params = buildArticlesParams({
      category: "BLOG",
      readFilter: "unread",
      view: "starred",
      search: "foo",
      cursor: "1_a",
    });
    expect(params.get("category")).toBe("BLOG");
    expect(params.get("isRead")).toBe("false");
    expect(params.get("isStarred")).toBe("true");
    expect(params.get("search")).toBe("foo");
    expect(params.get("cursor")).toBe("1_a");
  });
});
