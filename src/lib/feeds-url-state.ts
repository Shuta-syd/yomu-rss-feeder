import type { ReadFilter } from "@/lib/articles-params";

// /feeds の閲覧状態を URL に保持し、リロード時に復元するためのパラメータ変換。
// 状態の真実は page.tsx の useState 側。これは「URLとの相互変換」のみを担う純粋関数。

export interface FeedsUrlState {
  articleId: string | null;
  feedId: string | null;
  category: string | null;
  view: "feeds" | "starred";
  readFilter: ReadFilter;
  search: string;
}

/** window.location.search 等のクエリ文字列を状態に変換する。不正値は既定にフォールバック。 */
export function parseFeedsUrl(search: string): FeedsUrlState {
  const p = new URLSearchParams(search);
  const feedId = p.get("feed") || null;
  const category = p.get("cat") || null;
  const filter = p.get("filter");
  return {
    articleId: p.get("article") || null,
    // feed と cat は排他: feed 優先
    feedId,
    category: feedId ? null : category,
    view: p.get("view") === "starred" ? "starred" : "feeds",
    readFilter: filter === "unread" ? "unread" : filter === "read" ? "read" : "all",
    search: p.get("q") ?? "",
  };
}

/** 状態をクエリ文字列 ("?..." または "") に変換する。既定値は省略して URL を綺麗に保つ。 */
export function buildFeedsUrl(state: FeedsUrlState): string {
  const p = new URLSearchParams();
  if (state.feedId) p.set("feed", state.feedId);
  else if (state.category) p.set("cat", state.category);
  if (state.view === "starred") p.set("view", "starred");
  if (state.readFilter === "unread") p.set("filter", "unread");
  else if (state.readFilter === "read") p.set("filter", "read");
  const q = state.search.trim();
  if (q) p.set("q", q);
  if (state.articleId) p.set("article", state.articleId);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}
