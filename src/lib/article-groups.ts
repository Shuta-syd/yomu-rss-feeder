import type { ArticleDTO } from "../types/article";

type Groupable = Pick<ArticleDTO, "id" | "url" | "title" | "publishedAt">;
export interface ArticleGroup<T> { representative: T; related: T[] }
const TWO_DAYS = 48 * 60 * 60 * 1000;

// Preserve content-bearing query parameters, paths, and URL schemes.
export function articleUrlKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || ["fbclid", "gclid", "msclkid"].includes(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}

function titleKey(title: string): string | null {
  // Keep numbers, words and punctuation: small semantic differences must stay separate.
  const normalized = title.normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized.length >= 24 ? normalized : null;
}

/** Groups only the loaded, filtered list; the first article remains the representative. */
export function groupArticles<T extends Groupable>(articles: T[]): ArticleGroup<T>[] {
  const groups: ArticleGroup<T>[] = [];
  const byUrl = new Map<string, ArticleGroup<T>>();
  const byTitle = new Map<string, ArticleGroup<T>[]>();
  for (const article of articles) {
    const url = articleUrlKey(article.url);
    const title = titleKey(article.title);
    let group = url ? byUrl.get(url) : undefined;
    if (!group && title && article.publishedAt !== null) {
      group = byTitle.get(title)?.find(candidate => candidate.representative.publishedAt !== null &&
        Math.abs(candidate.representative.publishedAt - article.publishedAt!) <= TWO_DAYS);
    }
    if (group) group.related.push(article);
    else {
      group = { representative: article, related: [] };
      groups.push(group);
      if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), group]);
    }
    if (url) byUrl.set(url, group);
  }
  return groups;
}
