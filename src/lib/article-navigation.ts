import type { ArticleGroup } from "./article-groups";

/** Follow the visible groups, including when a related item is open. */
export function articleNeighbors<T extends { id: string; sortKey: number }>(
  groups: readonly ArticleGroup<T>[],
  selected: T | null,
): { previous: T | null; next: T | null } {
  if (!selected) return { previous: null, next: null };
  const index = groups.findIndex(group => group.representative.id === selected.id || group.related.some(a => a.id === selected.id));
  if (index >= 0) return {
    previous: groups[index - 1]?.representative ?? null,
    next: groups[index + 1]?.representative ?? null,
  };
  // An open article can leave the current results (e.g. removing "read later").
  // Keep its position using the same descending date/ID order as the query.
  const insertion = groups.findIndex(({ representative: a }) =>
    a.sortKey < selected.sortKey || (a.sortKey === selected.sortKey && a.id < selected.id));
  const position = insertion < 0 ? groups.length : insertion;
  return {
    previous: groups[position - 1]?.representative ?? null,
    next: groups[position]?.representative ?? null,
  };
}
