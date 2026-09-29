import { describe, expect, it } from "vitest";
import { previewTags, previewText } from "../../src/lib/article-preview";

describe("article preview", () => {
  it("uses saved industries and topics without duplicating tags", () => {
    expect(previewTags(JSON.stringify(["ジャンル:テクノロジー", "業界:食品・農業", "テーマ:AI", "テーマ:AI", "自由タグ"]))).toEqual(["業界:食品・農業", "テーマ:AI"]);
  });
  it("falls back to a saved genre for general news", () => {
    expect(previewTags('["ジャンル:スポーツ"]')).toEqual(["ジャンル:スポーツ"]);
  });
  it("ignores malformed legacy values and unknown labels", () => {
    for (const raw of [null, "{broken", "null", "{}", '[1,null,"業界:不明"]']) expect(previewTags(raw)).toEqual([]);
  });
  it("normalizes empty translations and multiline summaries", () => {
    expect(previewText("  \n ")).toBe("");
    expect(previewText("導入事例。\n  費用を削減。 ")).toBe("導入事例。 費用を削減。");
  });
});
