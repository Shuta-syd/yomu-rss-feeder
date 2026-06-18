"use client";

import { useEffect, useState } from "react";
import {
  FONT_SIZE_OPTIONS,
  FONT_SIZE_STORAGE_KEY,
  parseFontSizeLevel,
  applyArticleFontSize,
  type FontSizeLevel,
} from "@/lib/article-font-size";

// 記事本文の文字サイズを 5段階で選ぶセグメントUI。テーマと同じく
// localStorage に保存し、即座に CSS変数へ反映する (サーバ保存なし)。
export function ArticleFontSizeControl() {
  const [level, setLevel] = useState<FontSizeLevel | null>(null);

  useEffect(() => {
    setLevel(parseFontSizeLevel(localStorage.getItem(FONT_SIZE_STORAGE_KEY)));
  }, []);

  function select(next: FontSizeLevel) {
    setLevel(next);
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
    applyArticleFontSize(next);
  }

  // localStorage 読み込み前は描画しない (チラつき防止)
  if (level === null) return null;

  return (
    <div className="flex items-stretch gap-1.5" role="group" aria-label="記事の文字サイズ">
      {FONT_SIZE_OPTIONS.map((o) => {
        const active = o.level === level;
        return (
          <button
            key={o.level}
            type="button"
            onClick={() => select(o.level)}
            aria-pressed={active}
            className="flex flex-1 flex-col items-center gap-1 rounded-md py-2 transition-colors"
            style={{
              background: active ? "var(--accent-subtle)" : "var(--bg)",
              color: active ? "var(--accent)" : "var(--muted)",
              border: `1px solid ${active ? "var(--accent)" : "var(--card-border)"}`,
            }}
            title={`${o.label} (${o.px}px)`}
          >
            <span style={{ fontSize: `${o.px}px`, lineHeight: 1, fontWeight: active ? 700 : 500 }}>
              A
            </span>
            <span className="text-[11px]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
