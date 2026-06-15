/**
 * バックグラウンド更新用の記事リストマージ。
 * fetched (最新の1ページ目) を正として同一IDの行を置き換え、
 * fetched に含まれない読み込み済みの行 (無限スクロール分) は保持する。
 * リスト全体を作り直さないことで、行コンポーネントの再マウント
 * (サムネイル画像の再読み込み) を防ぐ。
 */
export function mergeArticles<T extends { id: string; sortKey: number }>(
  current: readonly T[],
  fetched: readonly T[],
): T[] {
  if (current.length === 0) return [...fetched];

  const currentById = new Map(current.map((a) => [a.id, a]));
  const mergedFetched = fetched.map((article) => {
    const existing = currentById.get(article.id);
    return existing && shallowEqualArticle(existing, article) ? existing : article;
  });
  const fetchedIds = new Set(fetched.map((a) => a.id));
  const tail = current.filter((a) => !fetchedIds.has(a.id));

  const merged = [...mergedFetched, ...tail].sort(
    (x, y) => y.sortKey - x.sortKey || (x.id < y.id ? 1 : x.id > y.id ? -1 : 0),
  );

  return sameArticleOrder(current, merged) ? (current as T[]) : merged;
}

function shallowEqualArticle<T extends { id: string; sortKey: number }>(a: T, b: T): boolean {
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (aRecord[key] !== bRecord[key]) return false;
  }
  return true;
}

function sameArticleOrder<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((article, index) => article === b[index]);
}

/**
 * 無限スクロールの次ページ追記。マージ更新でカーソル位置より深い行が
 * 既に取り込まれている場合があるため、ID重複を除外して追記する。
 */
export function appendArticles<T extends { id: string }>(
  current: readonly T[],
  page: readonly T[],
): T[] {
  const seen = new Set(current.map((a) => a.id));
  return [...current, ...page.filter((a) => !seen.has(a.id))];
}
