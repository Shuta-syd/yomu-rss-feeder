// 記事本文のフォントサイズ設定。テーマと同じく localStorage に保存し、
// documentElement の CSS変数 --article-font-size を介して prose に反映する。

export type FontSizeLevel = 1 | 2 | 3 | 4 | 5;

export const FONT_SIZE_STORAGE_KEY = "articleFontSize";
export const DEFAULT_FONT_SIZE_LEVEL: FontSizeLevel = 3;

export interface FontSizeOption {
  level: FontSizeLevel;
  label: string;
  px: number;
}

// 中(15px)が現状の既定値。比例拡大の基準になる。
export const FONT_SIZE_OPTIONS: readonly FontSizeOption[] = [
  { level: 1, label: "極小", px: 13 },
  { level: 2, label: "小", px: 14 },
  { level: 3, label: "中", px: 15 },
  { level: 4, label: "大", px: 18 },
  { level: 5, label: "特大", px: 21 },
];

/** localStorage 等から読んだ値を 1..5 のレベルに正規化する。不正値は既定(中)。 */
export function parseFontSizeLevel(raw: string | null | undefined): FontSizeLevel {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= 5) return n as FontSizeLevel;
  return DEFAULT_FONT_SIZE_LEVEL;
}

/** レベル → px。不正レベルは既定(中=15px)。 */
export function fontSizePx(level: FontSizeLevel): number {
  return FONT_SIZE_OPTIONS.find((o) => o.level === level)?.px ?? 15;
}

/** documentElement に CSS変数を適用する (ブラウザのみ)。 */
export function applyArticleFontSize(level: FontSizeLevel): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    "--article-font-size",
    `${fontSizePx(level)}px`,
  );
}
