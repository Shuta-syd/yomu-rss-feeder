import { describe, it, expect } from "vitest";
import { dateKey, formatDateHeader } from "@/lib/article-date";

function localMs(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

describe("dateKey", () => {
  it("同じ日の 0:00 と 23:59 は同じキー", () => {
    expect(dateKey(localMs(2026, 5, 17, 0, 0))).toBe(
      dateKey(localMs(2026, 5, 17, 23, 59)),
    );
  });

  it("翌日 0:00 で別キー", () => {
    expect(dateKey(localMs(2026, 5, 17, 23, 59))).not.toBe(
      dateKey(localMs(2026, 5, 18, 0, 0)),
    );
  });

  it("月またぎで別キー", () => {
    expect(dateKey(localMs(2026, 5, 31))).not.toBe(dateKey(localMs(2026, 6, 1)));
  });

  it("年またぎで別キー", () => {
    expect(dateKey(localMs(2026, 12, 31))).not.toBe(dateKey(localMs(2027, 1, 1)));
  });

  it("YYYY-MM-DD 形式である", () => {
    expect(dateKey(localMs(2026, 5, 17))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatDateHeader", () => {
  const now = localMs(2026, 5, 17, 12, 0);

  it("当日は「今日」", () => {
    expect(formatDateHeader(localMs(2026, 5, 17, 9, 0), now)).toBe("今日");
    expect(formatDateHeader(localMs(2026, 5, 17, 0, 0), now)).toBe("今日");
    expect(formatDateHeader(localMs(2026, 5, 17, 23, 59), now)).toBe("今日");
  });

  it("前日は「昨日」", () => {
    expect(formatDateHeader(localMs(2026, 5, 16, 23, 0), now)).toBe("昨日");
    expect(formatDateHeader(localMs(2026, 5, 16, 0, 0), now)).toBe("昨日");
  });

  it("一昨日以前は M月D日(曜)", () => {
    // 2026-05-15 = 金曜日
    expect(formatDateHeader(localMs(2026, 5, 15), now)).toBe("5月15日(金)");
  });

  it("月またぎ", () => {
    // 2026-04-30 = 木
    expect(formatDateHeader(localMs(2026, 4, 30), now)).toBe("4月30日(木)");
  });

  it("前年は YYYY年M月D日(曜)", () => {
    // 2025-12-31 = 水
    expect(formatDateHeader(localMs(2025, 12, 31), now)).toBe("2025年12月31日(水)");
  });

  it("曜日記号が正しい", () => {
    // 2026-05-17 = 日曜日
    const today = localMs(2026, 5, 17);
    const earlier = localMs(2026, 5, 10); // 日
    expect(formatDateHeader(earlier, today)).toBe("5月10日(日)");
  });
});
