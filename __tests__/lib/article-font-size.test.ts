import { describe, it, expect } from "vitest";
import {
  parseFontSizeLevel,
  fontSizePx,
  DEFAULT_FONT_SIZE_LEVEL,
  FONT_SIZE_OPTIONS,
} from "@/lib/article-font-size";

describe("parseFontSizeLevel", () => {
  it("1..5 の文字列をレベルに変換する", () => {
    expect(parseFontSizeLevel("1")).toBe(1);
    expect(parseFontSizeLevel("3")).toBe(3);
    expect(parseFontSizeLevel("5")).toBe(5);
  });

  it("null/undefined は既定(中=3)", () => {
    expect(parseFontSizeLevel(null)).toBe(DEFAULT_FONT_SIZE_LEVEL);
    expect(parseFontSizeLevel(undefined)).toBe(DEFAULT_FONT_SIZE_LEVEL);
  });

  it("範囲外・非整数・非数値は既定にフォールバック", () => {
    expect(parseFontSizeLevel("0")).toBe(DEFAULT_FONT_SIZE_LEVEL);
    expect(parseFontSizeLevel("6")).toBe(DEFAULT_FONT_SIZE_LEVEL);
    expect(parseFontSizeLevel("2.5")).toBe(DEFAULT_FONT_SIZE_LEVEL);
    expect(parseFontSizeLevel("abc")).toBe(DEFAULT_FONT_SIZE_LEVEL);
    expect(parseFontSizeLevel("")).toBe(DEFAULT_FONT_SIZE_LEVEL);
  });
});

describe("fontSizePx", () => {
  it("レベルごとの px を返す", () => {
    expect(fontSizePx(1)).toBe(13);
    expect(fontSizePx(3)).toBe(15);
    expect(fontSizePx(5)).toBe(21);
  });

  it("既定レベル(中)は現状の 15px", () => {
    expect(fontSizePx(DEFAULT_FONT_SIZE_LEVEL)).toBe(15);
  });
});

describe("FONT_SIZE_OPTIONS", () => {
  it("5段階で level が 1..5 の昇順", () => {
    expect(FONT_SIZE_OPTIONS.map((o) => o.level)).toEqual([1, 2, 3, 4, 5]);
  });

  it("px は単調増加 (昇順かつ重複なし)", () => {
    const pxs = FONT_SIZE_OPTIONS.map((o) => o.px);
    expect(pxs).toEqual([...pxs].sort((a, b) => a - b));
    expect(new Set(pxs).size).toBe(pxs.length);
  });
});
