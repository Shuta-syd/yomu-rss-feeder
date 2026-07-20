import { describe, expect, it } from "vitest";
import {
  buildExistingCategoryOptions,
  resolveAddFeedCategory,
} from "@/lib/feed-categories";

describe("buildExistingCategoryOptions", () => {
  it("未分類を先頭に置き、重複と空白を除いて既存カテゴリを並べる", () => {
    expect(
      buildExistingCategoryOptions(["Tech", " News ", "Tech", "", "未分類"]),
    ).toEqual(["未分類", "News", "Tech"]);
  });

  it("既存カテゴリがなくても未分類を選べる", () => {
    expect(buildExistingCategoryOptions([])).toEqual(["未分類"]);
  });
});

describe("resolveAddFeedCategory", () => {
  it("既存カテゴリの選択値を返す", () => {
    expect(resolveAddFeedCategory("existing", "Tech", "ignored")).toBe("Tech");
  });

  it("新規カテゴリ名の前後空白を除く", () => {
    expect(resolveAddFeedCategory("new", "未分類", "  新着  ")).toBe("新着");
  });

  it("新規カテゴリ名が空白だけなら未指定にする", () => {
    expect(resolveAddFeedCategory("new", "未分類", "   ")).toBeUndefined();
  });
});
