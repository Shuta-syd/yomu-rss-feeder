import { describe, it, expect } from "vitest";
import {
  parseFeedsUrl,
  buildFeedsUrl,
  type FeedsUrlState,
} from "@/lib/feeds-url-state";

const EMPTY: FeedsUrlState = {
  articleId: null,
  feedId: null,
  category: null,
  view: "feeds",
  readFilter: "all",
  search: "",
};

describe("parseFeedsUrl", () => {
  it("空クエリは既定状態", () => {
    expect(parseFeedsUrl("")).toEqual(EMPTY);
  });

  it("各パラメータを読み取る", () => {
    const s = parseFeedsUrl("?article=a1&feed=f1&filter=unread&q=hello");
    expect(s.articleId).toBe("a1");
    expect(s.feedId).toBe("f1");
    expect(s.readFilter).toBe("unread");
    expect(s.search).toBe("hello");
  });

  it("view=starred を読み取る", () => {
    expect(parseFeedsUrl("?view=starred").view).toBe("starred");
    expect(parseFeedsUrl("?view=feeds").view).toBe("feeds");
  });

  it("feed と cat 両方ある場合は feed 優先 (cat は無視)", () => {
    const s = parseFeedsUrl("?feed=f1&cat=BLOG");
    expect(s.feedId).toBe("f1");
    expect(s.category).toBeNull();
  });

  it("cat 単独は category として読む", () => {
    const s = parseFeedsUrl("?cat=BLOG");
    expect(s.feedId).toBeNull();
    expect(s.category).toBe("BLOG");
  });

  it("不正な filter は all", () => {
    expect(parseFeedsUrl("?filter=xxx").readFilter).toBe("all");
  });
});

describe("buildFeedsUrl", () => {
  it("既定状態は空文字列", () => {
    expect(buildFeedsUrl(EMPTY)).toBe("");
  });

  it("feedId を含める", () => {
    expect(buildFeedsUrl({ ...EMPTY, feedId: "f1" })).toBe("?feed=f1");
  });

  it("feedId 指定時は category を付けない", () => {
    expect(buildFeedsUrl({ ...EMPTY, feedId: "f1", category: "BLOG" })).toBe("?feed=f1");
  });

  it("category 単独", () => {
    expect(buildFeedsUrl({ ...EMPTY, category: "BLOG" })).toBe("?cat=BLOG");
  });

  it("readFilter / view / search / article を含める", () => {
    const url = buildFeedsUrl({
      articleId: "a1",
      feedId: null,
      category: null,
      view: "starred",
      readFilter: "read",
      search: "  foo  ",
    });
    const p = new URLSearchParams(url);
    expect(p.get("article")).toBe("a1");
    expect(p.get("view")).toBe("starred");
    expect(p.get("filter")).toBe("read");
    expect(p.get("q")).toBe("foo");
  });

  it("空白のみの search は省略", () => {
    expect(buildFeedsUrl({ ...EMPTY, search: "   " })).toBe("");
  });
});

describe("parse → build ラウンドトリップ", () => {
  it("代表的な状態が往復で保たれる", () => {
    const cases = [
      "?feed=f1&filter=unread&article=a9",
      "?cat=BLOG&view=starred",
      "?q=keyword",
      "",
    ];
    for (const c of cases) {
      const round = buildFeedsUrl(parseFeedsUrl(c));
      // 再度パースして等価であること (パラメータ順序差を吸収)
      expect(parseFeedsUrl(round)).toEqual(parseFeedsUrl(c));
    }
  });
});
